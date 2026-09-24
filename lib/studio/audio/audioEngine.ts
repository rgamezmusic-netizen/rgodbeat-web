import {
  BeatData,
  BeatFX,
  LoopSettings,
  VocalClip,
  VocalFX,
  VocalTrack,
  VocalTrackId,
} from '../types/audio';
import { createReverbImpulse } from './reverbImpulse';
import { audioBufferToWav, extractWaveformPeaks } from './wavEncoder';
import { processVocalTune } from './pitchCorrection';

export interface AudioEngineCallbacks {
  onTimeUpdate: (currentTime: number) => void;
  onPlaybackEnded: () => void;
  onCountInBeat: (beat: number) => void;
  onRecordingFinished: (trackId: VocalTrackId, buffer: AudioBuffer, waveform: number[]) => void;
  onRecordingAborted: () => void;
  onError: (msg: string) => void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private callbacks: AudioEngineCallbacks;

  // Beat Nodes
  private beatData: BeatData | null = null;
  private beatSource: AudioBufferSourceNode | null = null;
  private beatHighPassNode: BiquadFilterNode | null = null;
  private beatLowPassNode: BiquadFilterNode | null = null;
  private beatGainNode: GainNode | null = null;

  // Master
  private masterGainNode: GainNode | null = null;
  private masterAnalyserNode: AnalyserNode | null = null;

  // Vocal Track Source Nodes (keyed by `${trackId}-${clipId}`)
  private vocalSources: Map<string, AudioBufferSourceNode> = new Map();
  private vocalNodes: Map<
    VocalTrackId,
    {
      lowCut: BiquadFilterNode;
      lowEq: BiquadFilterNode;
      midEq: BiquadFilterNode;
      highEq: BiquadFilterNode;
      compressor: DynamicsCompressorNode;
      saturation: WaveShaperNode;
      delay: DelayNode;
      delayFeedback: GainNode;
      delayMix: GainNode;
      reverbConvolver: ConvolverNode;
      reverbMix: GainNode;
      trackGain: GainNode;
      panner: StereoPannerNode;
    }
  > = new Map();

  // State
  private isPlaying = false;
  private isRecording = false;
  private recordingTrackId: VocalTrackId | null = null;
  private currentPlaybackPosition = 0; // seconds into the beat
  private playbackStartCtxTime = 0;
  private animationFrameId: number | null = null;

  // Recording
  private micStream: MediaStream | null = null;
  private micStreamDest: MediaStreamAudioDestinationNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micHighPassFilter: BiquadFilterNode | null = null;
  private micInputGain: GainNode | null = null;
  private micInputGainValue = 1.0;
  private micIsClipping = false;
  private micClipTimestamp = 0;
  private micAnalyser: AnalyserNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaRecorderChunks: Blob[] = [];
  private recordedPCMChunks: Float32Array[] = [];
  private recordingStartBeatTime = 0;
  private recordingLatencyCompensation = -0.025; // -25ms default pocket calibration
  private cancelCountIn = false;

  // Settings
  private loopSettings: LoopSettings = {
    enabled: false,
    bars: 8,
    startBar: 0,
    startSec: 0,
    endSec: 0,
  };

  private beatFX: BeatFX = {
    lowPass: 20000,
    highPass: 20,
    volume: 1.0,
  };

  // Reverb Impulse Buffers cache
  private reverbImpulses: Map<string, AudioBuffer> = new Map();

  constructor(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initializes or resumes the AudioContext on first user interaction.
   */
  public async ensureAudioContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      try {
        this.ctx = new AudioCtxClass({
          latencyHint: 'interactive',
          sampleRate: 48000,
        });
      } catch {
        this.ctx = new AudioCtxClass();
      }
      this.setupMasterGraph();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Hardware audio unlock for mobile Safari / Chrome.
   * Plays a silent 1-sample buffer and resumes AudioContext synchronously on user gesture.
   */
  public async unlockAudio(): Promise<void> {
    if (!this.ctx) {
      await this.ensureAudioContext();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // ignore
      }
    }
    try {
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch {
      // ignore
    }
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  private setupMasterGraph() {
    if (!this.ctx) return;
    this.masterGainNode = this.ctx.createGain();
    this.masterGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.masterAnalyserNode = this.ctx.createAnalyser();
    this.masterAnalyserNode.fftSize = 128;
    this.masterAnalyserNode.smoothingTimeConstant = 0.8;

    this.masterGainNode.connect(this.masterAnalyserNode);
    this.masterAnalyserNode.connect(this.ctx.destination);

    // Setup Beat FX Chain
    this.beatHighPassNode = this.ctx.createBiquadFilter();
    this.beatHighPassNode.type = 'highpass';
    this.beatHighPassNode.frequency.setValueAtTime(this.beatFX.highPass, this.ctx.currentTime);

    this.beatLowPassNode = this.ctx.createBiquadFilter();
    this.beatLowPassNode.type = 'lowpass';
    this.beatLowPassNode.frequency.setValueAtTime(this.beatFX.lowPass, this.ctx.currentTime);

    this.beatGainNode = this.ctx.createGain();
    this.beatGainNode.gain.setValueAtTime(this.beatFX.volume, this.ctx.currentTime);

    this.beatHighPassNode.connect(this.beatLowPassNode);
    this.beatLowPassNode.connect(this.beatGainNode);
    this.beatGainNode.connect(this.masterGainNode);

    // Pre-cache reverb impulse responses
    this.getReverbImpulse('ROOM');
    this.getReverbImpulse('PLATE');
    this.getReverbImpulse('HALL');
  }

  private getReverbImpulse(preset: 'ROOM' | 'PLATE' | 'HALL'): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.reverbImpulses.has(preset)) {
      const impulse = createReverbImpulse(this.ctx, preset);
      this.reverbImpulses.set(preset, impulse);
    }
    return this.reverbImpulses.get(preset) || null;
  }

  public setBeat(beat: BeatData) {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.beatData = beat;
    this.currentPlaybackPosition = 0;
    this.callbacks.onTimeUpdate(0);
    this.updateLoopBounds();
    if (wasPlaying) {
      this.play();
    }
  }

  public updateBeatBpm(bpm: number) {
    if (!this.beatData) return;
    this.beatData.bpm = bpm;
    this.updateLoopBounds();
  }

  public getBeat(): BeatData | null {
    return this.beatData;
  }

  public setLoopSettings(loop: LoopSettings) {
    this.loopSettings = loop;
    this.updateLoopBounds();
  }

  private updateLoopBounds() {
    if (!this.beatData) return;
    const secPerBeat = 60 / this.beatData.bpm;
    const secPerBar = secPerBeat * 4;

    if (this.loopSettings.bars === 'all') {
      this.loopSettings.startSec = 0;
      this.loopSettings.endSec = this.beatData.duration;
    } else {
      const barCount = this.loopSettings.bars;
      this.loopSettings.startSec = this.loopSettings.startBar * secPerBar;
      this.loopSettings.endSec = Math.min(
        this.beatData.duration,
        this.loopSettings.startSec + barCount * secPerBar
      );
    }
  }

  public setBeatFX(fx: BeatFX) {
    this.beatFX = fx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.beatHighPassNode) {
      this.beatHighPassNode.frequency.setTargetAtTime(
        Math.max(20, Math.min(2000, fx.highPass)),
        t,
        0.05
      );
    }
    if (this.beatLowPassNode) {
      this.beatLowPassNode.frequency.setTargetAtTime(
        Math.max(200, Math.min(20000, fx.lowPass)),
        t,
        0.05
      );
    }
    if (this.beatGainNode) {
      this.beatGainNode.gain.setTargetAtTime(Math.max(0, Math.min(1.5, fx.volume)), t, 0.05);
    }
  }

  private makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = amount * 18;
    const n = 4096;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / n - 1;
      if (k === 0) {
        curve[i] = x;
      } else {
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
    }
    return curve;
  }

  public updateVocalFX(track: VocalTrack, allTracks: VocalTrack[]) {
    if (!this.ctx || !this.masterGainNode) return;
    try {
      const t = this.ctx.currentTime;

      let nodes = this.vocalNodes.get(track.id);
      if (!nodes) {
        const lowCut = this.ctx.createBiquadFilter();
        lowCut.type = 'highpass';

        const lowEq = this.ctx.createBiquadFilter();
        lowEq.type = 'lowshelf';
        lowEq.frequency.setValueAtTime(100, t);

        const midEq = this.ctx.createBiquadFilter();
        midEq.type = 'peaking';
        midEq.frequency.setValueAtTime(2500, t);
        midEq.Q.setValueAtTime(1.0, t);

        const highEq = this.ctx.createBiquadFilter();
        highEq.type = 'highshelf';
        highEq.frequency.setValueAtTime(10000, t);

        const compressor = this.ctx.createDynamicsCompressor();
        compressor.attack.setValueAtTime(0.015, t);
        compressor.release.setValueAtTime(0.12, t);

        const saturation = this.ctx.createWaveShaper();
        saturation.oversample = '2x';

        const delay = this.ctx.createDelay(4.0);
        const delayFeedback = this.ctx.createGain();
        const delayMix = this.ctx.createGain();
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(delayMix);

        const reverbConvolver = this.ctx.createConvolver();
        const initialImpulse = this.getReverbImpulse(track.fx.reverb?.preset || 'ROOM');
        if (initialImpulse) {
          reverbConvolver.buffer = initialImpulse;
        }
        const reverbMix = this.ctx.createGain();
        reverbConvolver.connect(reverbMix);

        const trackGain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();

        lowCut.connect(lowEq);
        lowEq.connect(midEq);
        midEq.connect(highEq);
        highEq.connect(compressor);
        compressor.connect(saturation);

        saturation.connect(trackGain);
        saturation.connect(delay);
        delayMix.connect(trackGain);
        saturation.connect(reverbConvolver);
        reverbMix.connect(trackGain);

        trackGain.connect(panner);
        panner.connect(this.masterGainNode);

        nodes = {
          lowCut,
          lowEq,
          midEq,
          highEq,
          compressor,
          saturation,
          delay,
          delayFeedback,
          delayMix,
          reverbConvolver,
          reverbMix,
          trackGain,
          panner,
        };
        this.vocalNodes.set(track.id, nodes);
      }

      nodes.lowCut.frequency.setTargetAtTime(
        track.fx.eq.lowCut ? track.fx.eq.lowCutFreq || 120 : 20,
        t,
        0.05
      );
      nodes.lowEq.gain.setTargetAtTime(track.fx.eq.low, t, 0.05);
      nodes.midEq.gain.setTargetAtTime(track.fx.eq.mid, t, 0.05);
      nodes.highEq.gain.setTargetAtTime(track.fx.eq.high, t, 0.05);

      const compAmount = Math.max(0, Math.min(1, track.fx.comp.amount));
      nodes.compressor.threshold.setTargetAtTime(-10 - compAmount * 24, t, 0.05);
      nodes.compressor.ratio.setTargetAtTime(1.5 + compAmount * 6, t, 0.05);

      nodes.saturation.curve = this.makeSaturationCurve(track.fx.saturation.amount);

      if (this.beatData && track.fx.delay.division !== 'OFF') {
        const secPerBeat = 60 / this.beatData.bpm;
        let delayTimeSec = secPerBeat;
        switch (track.fx.delay.division) {
          case '1/8':
            delayTimeSec = secPerBeat * 0.5;
            break;
          case '1/4':
            delayTimeSec = secPerBeat;
            break;
          case '1/2':
            delayTimeSec = secPerBeat * 2;
            break;
          case '1 BAR':
            delayTimeSec = secPerBeat * 4;
            break;
        }
        nodes.delay.delayTime.setTargetAtTime(delayTimeSec, t, 0.05);
        const safeFeedback = Math.max(0, Math.min(0.85, track.fx.delay.feedback));
        nodes.delayFeedback.gain.setTargetAtTime(safeFeedback, t, 0.05);
        nodes.delayMix.gain.setTargetAtTime(Math.max(0, Math.min(1, track.fx.delay.mix)), t, 0.05);
      } else {
        nodes.delayMix.gain.setTargetAtTime(0, t, 0.05);
      }

      const impulse = this.getReverbImpulse(track.fx.reverb.preset);
      if (impulse && nodes.reverbConvolver.buffer !== impulse) {
        // ConvolverNode.buffer is write-once per WebAudio spec.
        // Disconnect old node and attach fresh Convolver to avoid InvalidStateError exception
        try {
          nodes.saturation.disconnect(nodes.reverbConvolver);
          nodes.reverbConvolver.disconnect();
        } catch {
          // ignore
        }
        const freshConvolver = this.ctx.createConvolver();
        freshConvolver.buffer = impulse;
        freshConvolver.connect(nodes.reverbMix);
        nodes.saturation.connect(freshConvolver);
        nodes.reverbConvolver = freshConvolver;
      }
      nodes.reverbMix.gain.setTargetAtTime(Math.max(0, Math.min(1, track.fx.reverb.mix)), t, 0.05);

      const hasAnySolo = allTracks.some((tr) => tr.isSolo);
      let effectiveVolume = track.volume;
      if (track.isMuted) {
        effectiveVolume = 0;
      } else if (hasAnySolo && !track.isSolo) {
        effectiveVolume = 0;
      }
      // Pro vocal makeup compensation: restores dynamic presence and body lost during compression
      const compMakeupGain = 1.0 + compAmount * 0.35;
      nodes.trackGain.gain.setTargetAtTime(effectiveVolume * compMakeupGain, t, 0.05);
      nodes.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, track.pan ?? 0)), t, 0.05);
    } catch (err) {
      console.warn('Error in updateVocalFX, handled gracefully:', err);
    }
  }

  public async play(vocalTracks: VocalTrack[] = []) {
    if (!this.beatData) return;
    this.releaseMicrophone();
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as unknown as { audioSession: { type: string } }).audioSession.type = 'playback';
      } catch {}
    }
    await this.unlockAudio();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {}
    }

    if (this.isPlaying) {
      this.stopSources();
    }

    // If playhead was at or beyond duration, restart from loop start or 0
    if (this.currentPlaybackPosition >= this.beatData.duration - 0.05) {
      this.currentPlaybackPosition = this.loopSettings.enabled ? this.loopSettings.startSec : 0;
    }

    const startPos = this.currentPlaybackPosition;
    const startTime = this.ctx.currentTime + 0.015;
    this.playbackStartCtxTime = startTime - startPos;

    // 1. Start Beat Source
    this.beatSource = this.ctx.createBufferSource();
    this.beatSource.buffer = this.beatData.buffer;
    if (this.beatHighPassNode) {
      this.beatSource.connect(this.beatHighPassNode);
    }
    this.beatSource.start(startTime, startPos);

    // 2. Start all active vocal tracks that have takes/clips
    for (const track of vocalTracks) {
      try {
        this.updateVocalFX(track, vocalTracks);
        const trackNodes = this.vocalNodes.get(track.id);
        if (!trackNodes) continue;

        // Extract all clips for this track line (or fallback to track.buffer)
        const clips: VocalClip[] = (track.clips && track.clips.length > 0)
          ? track.clips
          : (track.buffer ? [{
              id: `legacy-${track.id}`,
              buffer: track.buffer,
              tunedBuffer: track.tunedBuffer,
              startBeatOffset: track.startBeatOffset,
              duration: track.duration,
            }] : []);

        for (const clip of clips) {
          if (!clip.buffer) continue;
          const trackOffset = clip.startBeatOffset;
          const trackDur = clip.duration || clip.buffer.duration;

          const playBuffer = (track.fx.tune?.enabled && track.fx.tune.speed > 0.01 && clip.tunedBuffer)
            ? clip.tunedBuffer
            : (track.fx.tune?.enabled && track.fx.tune.speed > 0.01 && track.tunedBuffer && clips.length === 1)
            ? track.tunedBuffer
            : clip.buffer;

          const sourceKey = `${track.id}-${clip.id}`;

          if (startPos < trackOffset) {
            const source = this.ctx.createBufferSource();
            source.buffer = playBuffer;
            source.connect(trackNodes.lowCut);
            const when = this.playbackStartCtxTime + trackOffset;
            source.start(when, 0);
            this.vocalSources.set(sourceKey, source);
          } else if (startPos >= trackOffset && startPos < trackOffset + trackDur) {
            const source = this.ctx.createBufferSource();
            source.buffer = playBuffer;
            source.connect(trackNodes.lowCut);
            const offsetInTake = startPos - trackOffset;
            source.start(startTime, offsetInTake);
            this.vocalSources.set(sourceKey, source);
          }
        }
      } catch (trackPlayErr) {
        console.warn(`Error playing vocal track ${track.id}, skipping clip to keep beat playing:`, trackPlayErr);
      }
    }

    this.isPlaying = true;
    this.startPositionTracker(vocalTracks);
  }

  private isFinalizingRecording = false;

  public pause() {
    if (this.isRecording && !this.isFinalizingRecording) {
      this.stopRecording();
    }
    if (!this.isPlaying) return;
    this.stopSources();
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public stop() {
    if (this.isRecording && !this.isFinalizingRecording) {
      this.stopRecording();
    }
    this.releaseMicrophone();
    this.pause();
    this.currentPlaybackPosition = 0;
    this.callbacks.onTimeUpdate(0);
  }

  public seek(positionSec: number, vocalTracks: VocalTrack[] = []) {
    const wasPlaying = this.isPlaying;
    if (this.isRecording && !this.isFinalizingRecording) {
      this.stopRecording();
    }
    if (wasPlaying) {
      this.pause();
    }
    const maxDur = this.beatData ? this.beatData.duration : 0;
    this.currentPlaybackPosition = Math.max(0, Math.min(maxDur, positionSec));
    this.callbacks.onTimeUpdate(this.currentPlaybackPosition);
    if (wasPlaying) {
      this.play(vocalTracks);
    }
  }

  private stopSources() {
    if (this.beatSource) {
      try {
        this.beatSource.stop();
        this.beatSource.disconnect();
      } catch {
        // ignore
      }
      this.beatSource = null;
    }

    this.vocalSources.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // ignore
      }
    });
    this.vocalSources.clear();
  }

  private startPositionTracker(vocalTracks: VocalTrack[]) {
    const trackLoop = () => {
      if (!this.isPlaying || !this.ctx || !this.beatData) return;

      const elapsed = this.ctx.currentTime - this.playbackStartCtxTime;
      this.currentPlaybackPosition = elapsed;
      this.callbacks.onTimeUpdate(elapsed);

      if (this.loopSettings.enabled && elapsed >= this.loopSettings.endSec) {
        this.seek(this.loopSettings.startSec, vocalTracks);
        return;
      }

      if (elapsed >= this.beatData.duration) {
        if (this.loopSettings.enabled) {
          this.seek(this.loopSettings.startSec, vocalTracks);
        } else {
          this.stop();
          this.callbacks.onPlaybackEnded();
        }
        return;
      }

      this.animationFrameId = requestAnimationFrame(trackLoop);
    };

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame(trackLoop);
  }

  public playClick(freq: number = 880, duration: number = 0.05) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // ignore
    }
  }

  /**
   * Request microphone stream with multi-level browser fallback.
   * Explicitly disables mobile OS communication processing (echoCancellation, noiseSuppression, autoGainControl)
   * so recording captures pure audio and doesn't duck or squash playback.
   */
  public async getMicrophoneStream(): Promise<MediaStream> {
    if (this.micStream && this.micStream.active) {
      return this.micStream;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Legacy getUserMedia check
      const legacyGetUserMedia =
        (navigator as unknown as { getUserMedia?: (c: unknown, s: (st: MediaStream) => void, e: (er: unknown) => void) => void }).getUserMedia ||
        (navigator as unknown as { webkitGetUserMedia?: (c: unknown, s: (st: MediaStream) => void, e: (er: unknown) => void) => void }).webkitGetUserMedia;

      if (legacyGetUserMedia) {
        return new Promise((resolve, reject) => {
          legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
        });
      }
      throw new Error('Tu navegador no soporta grabación de micrófono (getUserMedia no disponible).');
    }

    try {
      // Universal mobile studio recording constraints (Android & iOS)
      // Uses ideal constraints so Android devices don't throw OverconstrainedError
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 48000 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      return this.micStream;
    } catch (e) {
      console.warn('Initial mic constraints failed, attempting fallback { channelCount: 1 }:', e);
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
        } catch {
          this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }
      return this.micStream;
    }
  }

  /**
   * Releases hardware microphone tracks immediately so iOS and Android exit
   * Voice-Communication / Call mode and instantly restore uncompressed Hi-Fi stereo playback.
   */
  public releaseMicrophone() {
    if (this.micStreamDest) {
      try {
        this.micStreamDest.stream.getTracks().forEach((track) => track.stop());
        if (this.micInputGain) {
          this.micInputGain.disconnect(this.micStreamDest);
        }
      } catch (err) {
        // ignore
      }
      this.micStreamDest = null;
    }

    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (err) {
        console.warn('Error releasing microphone tracks:', err);
      }
      this.micStream = null;
    }

    // Immediately restore high-fidelity stereo media playback mode on iOS Safari & Android.
    // Shifts output route back to the bottom stereo speakers and switches Bluetooth headsets
    // from telephone SCO/HFP mode (8kHz/16kHz) back to A2DP stereo studio quality.
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as unknown as { audioSession: { type: string } }).audioSession.type = 'playback';
        setTimeout(() => {
          try {
            (navigator as unknown as { audioSession: { type: string } }).audioSession.type = 'auto';
          } catch {}
        }, 120);
      } catch (err) {
        console.warn('Error resetting audioSession type:', err);
      }
    }
  }

  /**
   * Starts Recording Workflow:
   * 1. Acquires microphone permission.
   * 2. Optional 1-bar count-in.
   * 3. Initializes protected audio chain (rumble filter + auto-headroom gain + real-time peak meter).
   * 4. Starts MediaRecorder (320 kbps broadcast bitrate) + Float32 PCM backup.
   * 5. Starts synchronized playback.
   */
  public async startRecording(
    trackId: VocalTrackId,
    vocalTracks: VocalTrack[],
    withCountIn: boolean = true
  ): Promise<boolean> {
    if (!this.beatData) {
      this.callbacks.onError('Por favor carga un beat primero.');
      return false;
    }

    try {
      await this.ensureAudioContext();
      if (!this.ctx) return false;

      // 1. Acquire mic permission
      let stream: MediaStream;
      try {
        stream = await this.getMicrophoneStream();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isPermissionDenied =
          errMsg.toLowerCase().includes('permission') ||
          errMsg.toLowerCase().includes('denied') ||
          errMsg.toLowerCase().includes('notallowederror');

        const friendlyMsg = isPermissionDenied
          ? 'Permiso de micrófono denegado. Permite el acceso al micrófono en los ajustes de tu navegador.'
          : `No se pudo conectar al micrófono: ${errMsg}`;

        this.callbacks.onError(friendlyMsg);
        return false;
      }

      const wasPlaying = this.isPlaying;
      this.recordingTrackId = trackId;
      this.isRecording = true;
      this.cancelCountIn = false;
      this.recordedPCMChunks = [];
      this.mediaRecorderChunks = [];

      // Reset auto-gain protection state
      this.micInputGainValue = 1.0;
      this.micIsClipping = false;
      this.micClipTimestamp = 0;

      // 2. Count-in ONLY when the beat was stopped/paused
      const shouldCountIn = withCountIn && !wasPlaying;
      if (shouldCountIn) {
        const secPerBeat = 60 / this.beatData.bpm;
        for (let beat = 1; beat <= 4; beat++) {
          if (this.cancelCountIn || !this.isRecording) {
            this.callbacks.onCountInBeat(0);
            this.releaseMicrophone();
            this.callbacks.onRecordingAborted();
            return false;
          }
          this.callbacks.onCountInBeat(beat);
          this.playClick(beat === 1 ? 1200 : 800, 0.06);
          await new Promise((resolve) => setTimeout(resolve, secPerBeat * 1000));
        }
        this.callbacks.onCountInBeat(0); // clear count-in overlay
      } else {
        this.callbacks.onCountInBeat(0);
      }

      if (this.cancelCountIn || !this.isRecording) {
        this.releaseMicrophone();
        this.callbacks.onRecordingAborted();
        return false;
      }

      // If playback was at the very end and not playing, restart from beginning
      if (!wasPlaying && this.currentPlaybackPosition >= this.beatData.duration - 0.1) {
        this.currentPlaybackPosition = this.loopSettings.enabled ? this.loopSettings.startSec : 0;
      }

      // 3. Audio graph with Anti-Saturation Auto-Gain Protection:
      // micSource -> micHighPassFilter (35Hz gentle rumble cleaner) -> micInputGain (dynamic auto-attenuator) -> micAnalyser & recorder
      this.micSource = this.ctx.createMediaStreamSource(stream);

      // High-pass filter at 35Hz (Q=0.7) to eliminate mic stand thumps, desk vibrations and wind rumble
      this.micHighPassFilter = this.ctx.createBiquadFilter();
      this.micHighPassFilter.type = 'highpass';
      this.micHighPassFilter.frequency.setValueAtTime(35, this.ctx.currentTime);
      this.micHighPassFilter.Q.setValueAtTime(0.7071, this.ctx.currentTime);

      // Dynamic gain node with auto-headroom protection
      this.micInputGain = this.ctx.createGain();
      this.micInputGain.gain.setValueAtTime(this.micInputGainValue, this.ctx.currentTime);

      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 64;
      this.micAnalyser.smoothingTimeConstant = 0.2;

      this.micSource.connect(this.micHighPassFilter);
      this.micHighPassFilter.connect(this.micInputGain);
      this.micInputGain.connect(this.micAnalyser);

      // Create stream destination from the processed/protected mic chain so MediaRecorder captures clean protected audio
      let recordingStream: MediaStream = stream;
      try {
        this.micStreamDest = this.ctx.createMediaStreamDestination();
        this.micInputGain.connect(this.micStreamDest);
        if (this.micStreamDest.stream && this.micStreamDest.stream.getAudioTracks().length > 0) {
          recordingStream = this.micStreamDest.stream;
        }
      } catch (err) {
        console.warn('MediaStreamDestination fallback to raw stream:', err);
      }

      // 4. Start MediaRecorder with pristine broadcast studio bitrate (320 kbps)
      if (typeof MediaRecorder !== 'undefined') {
        try {
          let mimeType = '';
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          }

          const recorderOptions: MediaRecorderOptions = {
            audioBitsPerSecond: 320000, // 320 kbps broadcast studio quality
          };
          if (mimeType) {
            recorderOptions.mimeType = mimeType;
          }

          this.mediaRecorder = new MediaRecorder(recordingStream, recorderOptions);

          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              this.mediaRecorderChunks.push(e.data);
            }
          };
          this.mediaRecorder.start(100);
        } catch (e) {
          console.warn('MediaRecorder init failed, relying on PCM processor:', e);
          this.mediaRecorder = null;
        }
      }

      // 5. ScriptProcessor as real-time peak detector + active saturation attenuator + Float32 PCM collector
      this.scriptProcessor = this.ctx.createScriptProcessor(4096, 1, 1);
      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const len = inputData.length;

        // True peak detector in this audio block
        let peak = 0;
        for (let i = 0; i < len; i++) {
          const absVal = Math.abs(inputData[i]);
          if (absVal > peak) peak = absVal;
        }

        // Saturation threshold: > 0.88 (-1.1 dBFS)
        if (peak >= 0.88) {
          this.micIsClipping = true;
          this.micClipTimestamp = Date.now();

          // Smoothly lower the input gain during recording to protect audio headroom:
          // "automáticamente se baje un poco mientras se graba para cuidar eso solo cuando se sature"
          const dropFactor = peak > 0.98 ? 0.78 : 0.85; // ~ -1.5 dB to -2.1 dB
          const targetGain = Math.max(0.32, this.micInputGainValue * dropFactor);

          if (this.micInputGain && this.ctx && Math.abs(targetGain - this.micInputGainValue) > 0.02) {
            this.micInputGainValue = targetGain;
            try {
              this.micInputGain.gain.cancelScheduledValues(this.ctx.currentTime);
              this.micInputGain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 0.035);
            } catch {
              this.micInputGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
            }
          }
        } else if (this.micIsClipping && Date.now() - this.micClipTimestamp > 1200) {
          this.micIsClipping = false;
        }

        // Analog tape soft saturation curve on PCM chunks to prevent harsh digital squaring
        const chunk = new Float32Array(len);
        for (let i = 0; i < len; i++) {
          let s = inputData[i];
          if (s > 0.94) {
            s = 0.94 + 0.06 * Math.tanh((s - 0.94) / 0.06);
          } else if (s < -0.94) {
            s = -0.94 + 0.06 * Math.tanh((s + 0.94) / 0.06);
          }
          chunk[i] = s;
        }

        this.recordedPCMChunks.push(chunk);
      };

      this.micInputGain.connect(this.scriptProcessor);
      const silentGain = this.ctx.createGain();
      silentGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.ctx.destination);

      // Record start position aligned to current beat time
      this.recordingStartBeatTime = Math.max(
        0,
        this.currentPlaybackPosition + this.recordingLatencyCompensation
      );

      // 5. Start synchronized playback if not already in playback
      if (!wasPlaying) {
        await this.play(vocalTracks);
      }
      return true;
    } catch (err) {
      this.releaseMicrophone();
      this.isRecording = false;
      this.recordingTrackId = null;
      const msg = err instanceof Error ? err.message : 'Error al inicializar la grabación';
      this.callbacks.onError(msg);
      this.callbacks.onRecordingAborted();
      return false;
    }
  }

  /**
   * Stops recording cleanly, decodes the audio, and saves the take to the vocal track.
   */
  public async stopRecording(): Promise<void> {
    if (this.isFinalizingRecording) return;
    this.isFinalizingRecording = true;

    try {
      this.cancelCountIn = true;
      this.callbacks.onCountInBeat(0);

      if (!this.isRecording || !this.ctx || !this.recordingTrackId) {
        this.isRecording = false;
        this.recordingTrackId = null;
        this.releaseMicrophone();
        this.callbacks.onRecordingAborted();
        return;
      }

      const targetTrackId = this.recordingTrackId;
      this.isRecording = false;
      this.recordingTrackId = null;

      // Disconnect mic audio graph nodes
      if (this.scriptProcessor && this.micSource) {
        try {
          this.scriptProcessor.disconnect();
          this.micSource.disconnect();
        } catch {
          // ignore
        }
        this.scriptProcessor = null;
        this.micSource = null;
      }

      // Stop playback
      this.pause();

      let finalBuffer: AudioBuffer | null = null;

    // 1. Collect data from MediaRecorder if active
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        const recorderPromise = new Promise<Blob>((resolve) => {
          if (!this.mediaRecorder) return resolve(new Blob());
          this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.mediaRecorderChunks, {
              type: this.mediaRecorder?.mimeType || 'audio/webm',
            });
            resolve(blob);
          };
          this.mediaRecorder.stop();
        });

        const blob = await recorderPromise;
        if (blob.size > 0) {
          const arrayBuffer = await blob.arrayBuffer();
          const decoded = await this.ctx.decodeAudioData(arrayBuffer);

          // Force 1-channel pure MONO centered
          if (decoded.numberOfChannels > 1) {
            const monoBuffer = this.ctx.createBuffer(1, decoded.length, decoded.sampleRate);
            const monoData = monoBuffer.getChannelData(0);
            const ch0 = decoded.getChannelData(0);
            const ch1 = decoded.getChannelData(1);

            let sum0 = 0;
            let sum1 = 0;
            const checkLen = Math.min(decoded.length, 44100 * 2);
            for (let i = 0; i < checkLen; i++) {
              sum0 += Math.abs(ch0[i]);
              sum1 += Math.abs(ch1[i]);
            }

            if (sum1 < sum0 * 0.05) {
              // Channel 1 is silent (common with 1-channel USB interface inputs)
              monoData.set(ch0);
            } else if (sum0 < sum1 * 0.05) {
              // Channel 0 is silent
              monoData.set(ch1);
            } else {
              // Stereo audio: average to dead center mono
              for (let i = 0; i < decoded.length; i++) {
                monoData[i] = (ch0[i] + ch1[i]) * 0.5;
              }
            }
            finalBuffer = monoBuffer;
          } else {
            finalBuffer = decoded;
          }
        }
      } catch (err) {
        console.warn('MediaRecorder blob decode error, falling back to PCM chunks:', err);
      }
    }

    // 2. Fallback to ScriptProcessor PCM chunks if MediaRecorder didn't produce a buffer
    if (!finalBuffer && this.recordedPCMChunks.length > 0) {
      let totalSamples = 0;
      for (const chunk of this.recordedPCMChunks) {
        totalSamples += chunk.length;
      }
      if (totalSamples > 0) {
        const sampleRate = this.ctx.sampleRate;
        finalBuffer = this.ctx.createBuffer(1, totalSamples, sampleRate);
        const channelData = finalBuffer.getChannelData(0);
        let offset = 0;
        for (const chunk of this.recordedPCMChunks) {
          channelData.set(chunk, offset);
          offset += chunk.length;
        }
      }
    }

    this.recordedPCMChunks = [];
    this.mediaRecorderChunks = [];

    // Check if recording has valid duration (> 0.2s)
    if (!finalBuffer || finalBuffer.duration < 0.2) {
      this.callbacks.onRecordingAborted();
      return;
    }

    // Extract waveform thumbnail
    const waveform = extractWaveformPeaks(finalBuffer, 48);

    // Notify callback
    this.callbacks.onRecordingFinished(targetTrackId, finalBuffer, waveform);
    } finally {
      this.releaseMicrophone();
      this.isFinalizingRecording = false;
    }
  }

  /**
   * Generates a synthetic melodious vocal take for testing or demo purposes
   * when microphone hardware is unavailable or in restricted sandboxes.
   */
  public generateTestVocalTake(trackId: VocalTrackId): { buffer: AudioBuffer; waveform: number[] } {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.setupMasterGraph();
    }

    const sampleRate = this.ctx.sampleRate;
    const bpm = this.beatData?.bpm || 140;
    const secPerBeat = 60 / bpm;
    const durSec = secPerBeat * 16; // 4 bars phrase
    const totalSamples = Math.floor(sampleRate * durSec);

    const buffer = this.ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    // Minor pentatonic vocal notes with variations per track type (lead 1, lead 2, double, harmonies)
    let melodyNotes = [220, 261.63, 293.66, 329.63, 392, 440, 392, 329.63];
    let pitchMultiplier = 1.0;

    if (trackId === 'lead2') {
      // Lead 2: Complementary melody line higher in octave for dual-lead layering
      melodyNotes = [329.63, 392, 440, 523.25, 440, 392, 329.63, 293.66];
    } else if (trackId === 'double') {
      pitchMultiplier = 1.004; // slight chorusing detune for wide double
    } else if (trackId === 'harmony1') {
      pitchMultiplier = 1.25; // Major 3rd interval
    } else if (trackId === 'harmony2') {
      pitchMultiplier = 1.5; // Perfect 5th interval
    } else if (trackId === 'adlibs') {
      melodyNotes = [440, 523.25, 392, 440, 587.33, 523.25, 440, 392];
    } else if (trackId === 'backing1') {
      pitchMultiplier = 1.334;
      melodyNotes = [293.66, 329.63, 392, 440, 392, 329.63, 293.66, 261.63];
    } else if (trackId === 'backing2') {
      pitchMultiplier = 1.6;
      melodyNotes = [329.63, 392, 440, 523.25, 440, 392, 329.63, 293.66];
    }

    for (let noteIdx = 0; noteIdx < 8; noteIdx++) {
      const noteFreq = melodyNotes[noteIdx] * pitchMultiplier;
      const startSample = Math.floor(noteIdx * (secPerBeat * 2) * sampleRate);
      const noteLen = Math.floor(secPerBeat * 1.8 * sampleRate);

      for (let i = 0; i < noteLen && startSample + i < totalSamples; i++) {
        const t = i / sampleRate;
        // Vocal formant simulation (fundamental + warm 2nd harmonic + vibrato)
        const vibrato = Math.sin(2 * Math.PI * 5.5 * t) * 4;
        const f = noteFreq + vibrato;
        const env = Math.sin((Math.PI * i) / noteLen);
        const sample =
          (Math.sin(2 * Math.PI * f * t) * 0.6 +
            Math.sin(2 * Math.PI * f * 2 * t) * 0.25 +
            Math.sin(2 * Math.PI * f * 3 * t) * 0.15) *
          env;
        data[startSample + i] += sample * 0.7;
      }
    }

    const waveform = extractWaveformPeaks(buffer, 48);
    return { buffer, waveform };
  }

  public getMicInputLevel(): number {
    if (!this.micAnalyser) return 0;
    const data = new Uint8Array(this.micAnalyser.frequencyBinCount);
    this.micAnalyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return Math.min(1, (sum / data.length) / 128);
  }

  /**
   * Returns current real-time microphone status including anti-saturation protection state.
   */
  public getMicInputStatus(): { level: number; isSaturated: boolean; gainReductionDb: number } {
    const isSaturated = this.micIsClipping || (Date.now() - this.micClipTimestamp < 1200);
    const level = this.getMicInputLevel();
    const gainReductionDb = this.micInputGainValue < 0.99
      ? Math.round(20 * Math.log10(this.micInputGainValue) * 10) / 10
      : 0;

    return {
      level,
      isSaturated,
      gainReductionDb,
    };
  }

  public getRecordingStartBeatTime(): number {
    return this.recordingStartBeatTime;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getCurrentPlaybackPosition(): number {
    return this.currentPlaybackPosition;
  }

  public async exportMix(
    vocalTracks: VocalTrack[],
    options?: { sidechainDb?: number; enableSidechain?: boolean }
  ): Promise<Blob> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado para exportar');
    }

    // 24-bit / 48.0 kHz Studio Master Quality
    const TARGET_SAMPLE_RATE = 48000;
    const duration = this.beatData.duration;
    const length = Math.max(1, Math.ceil(TARGET_SAMPLE_RATE * duration));

    const offlineCtx = new OfflineAudioContext(2, length, TARGET_SAMPLE_RATE);

    // 1. Master Gain
    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, 0);
    masterGain.connect(offlineCtx.destination);

    // 2. Beat Chain with Frequency Crossover:
    // Sub-bass & 808 (< 175 Hz) remain 100% UNTOUCHED (Zero bass compression).
    // Mid/high frequencies (> 175 Hz) receive the sidechain ducking curve for vocal clarity.
    const beatHighPass = offlineCtx.createBiquadFilter();
    beatHighPass.type = 'highpass';
    beatHighPass.frequency.setValueAtTime(this.beatFX.highPass, 0);

    const beatLowPass = offlineCtx.createBiquadFilter();
    beatLowPass.type = 'lowpass';
    beatLowPass.frequency.setValueAtTime(this.beatFX.lowPass, 0);

    beatHighPass.connect(beatLowPass);

    const bassCrossoverFreq = 175; // Hz

    // Branch A: Graves / Sub-bass / 808 (Untouched, punchy and uncompressed)
    const beatBassFilter = offlineCtx.createBiquadFilter();
    beatBassFilter.type = 'lowpass';
    beatBassFilter.frequency.setValueAtTime(bassCrossoverFreq, 0);
    beatBassFilter.Q.setValueAtTime(0.7071, 0);

    const beatBassGain = offlineCtx.createGain();
    beatBassGain.gain.setValueAtTime(this.beatFX.volume, 0);

    beatLowPass.connect(beatBassFilter);
    beatBassFilter.connect(beatBassGain);
    beatBassGain.connect(masterGain);

    // Branch B: Medios & Agudos (Vocal clash pocket, ducked smoothly when vocal sings)
    const beatMidHighFilter = offlineCtx.createBiquadFilter();
    beatMidHighFilter.type = 'highpass';
    beatMidHighFilter.frequency.setValueAtTime(bassCrossoverFreq, 0);
    beatMidHighFilter.Q.setValueAtTime(0.7071, 0);

    const beatMidHighGain = offlineCtx.createGain();
    beatLowPass.connect(beatMidHighFilter);
    beatMidHighFilter.connect(beatMidHighGain);
    beatMidHighGain.connect(masterGain);

    // 3. Dynamic Sidechain Ducking Calculation on the Mid/High Branch
    const sidechainDb = options?.sidechainDb ?? 3.0;
    const enableSidechain = options?.enableSidechain ?? true;

    if (enableSidechain && vocalTracks.some((t) => (t.buffer || (t.clips && t.clips.length > 0)) && !t.isMuted)) {
      const stepSec = 0.01; // 10ms sampling interval
      const numSteps = Math.ceil(duration / stepSec);
      const curve = new Float32Array(numSteps);
      const targetGainDucked = Math.pow(10, -Math.abs(sidechainDb) / 20); // ~0.7079

      interface ActiveClipRef {
        isLead: boolean;
        startSec: number;
        endSec: number;
        buffer: AudioBuffer;
      }
      const activeClips: ActiveClipRef[] = [];
      const hasSolo = vocalTracks.some((tr) => tr.isSolo);

      for (const track of vocalTracks) {
        if (track.isMuted || (hasSolo && !track.isSolo)) continue;
        const isLead = track.id === 'lead1' || track.id === 'lead2';
        const clips: VocalClip[] = (track.clips && track.clips.length > 0)
          ? track.clips
          : (track.buffer ? [{
              id: `tr-${track.id}`,
              buffer: track.buffer,
              startBeatOffset: track.startBeatOffset,
              duration: track.duration,
            }] : []);

        for (const c of clips) {
          if (!c.buffer) continue;
          activeClips.push({
            isLead,
            startSec: Math.max(0, c.startBeatOffset),
            endSec: Math.max(0, c.startBeatOffset) + c.duration,
            buffer: c.buffer,
          });
        }
      }

      // Compute presence envelope
      const rawDucking = new Float32Array(numSteps);
      for (let s = 0; s < numSteps; s++) {
        const t = s * stepSec;
        let vocalActivity = 0;

        for (const clip of activeClips) {
          if (t >= clip.startSec && t <= clip.endSec) {
            const clipSampleIdx = Math.floor((t - clip.startSec) * clip.buffer.sampleRate);
            if (clipSampleIdx >= 0 && clipSampleIdx < clip.buffer.length) {
              const chData = clip.buffer.getChannelData(0);
              let maxVal = 0;
              const maxInspect = Math.min(256, clip.buffer.length - clipSampleIdx);
              for (let j = 0; j < maxInspect; j += 4) {
                const absVal = Math.abs(chData[clipSampleIdx + j]);
                if (absVal > maxVal) maxVal = absVal;
              }
              const weight = clip.isLead ? 1.0 : 0.65;
              vocalActivity = Math.max(vocalActivity, maxVal * weight);
            }
          }
        }

        // If vocal presence detected (> -38 dBFS ~ 0.012 peak), duck mids down smoothly
        if (vocalActivity > 0.012) {
          const ratio = Math.min(1.0, (vocalActivity - 0.012) / 0.06);
          rawDucking[s] = 1.0 - (1.0 - targetGainDucked) * ratio;
        } else {
          rawDucking[s] = 1.0;
        }
      }

      // Smooth envelope with musical attack (~15ms) and release (~180ms)
      const attackCoeff = Math.exp(-stepSec / 0.015);
      const releaseCoeff = Math.exp(-stepSec / 0.180);
      let currentVal = 1.0;

      for (let s = 0; s < numSteps; s++) {
        const target = rawDucking[s];
        if (target < currentVal) {
          currentVal = attackCoeff * currentVal + (1 - attackCoeff) * target;
        } else {
          currentVal = releaseCoeff * currentVal + (1 - releaseCoeff) * target;
        }
        curve[s] = currentVal * this.beatFX.volume;
      }

      beatMidHighGain.gain.setValueCurveAtTime(curve, 0, duration);
    } else {
      beatMidHighGain.gain.setValueAtTime(this.beatFX.volume, 0);
    }

    const beatSource = offlineCtx.createBufferSource();
    beatSource.buffer = this.beatData.buffer;
    beatSource.connect(beatHighPass);
    beatSource.start(0);

    // 4. Vocal Tracks Chains
    const hasAnySolo = vocalTracks.some((tr) => tr.isSolo);

    for (const track of vocalTracks) {
      if (!track.buffer && (!track.clips || track.clips.length === 0)) continue;

      let effectiveVol = track.volume;
      if (track.isMuted) effectiveVol = 0;
      else if (hasAnySolo && !track.isSolo) effectiveVol = 0;

      if (effectiveVol <= 0.001) continue;

      const lowCut = offlineCtx.createBiquadFilter();
      lowCut.type = 'highpass';
      lowCut.frequency.setValueAtTime(track.fx.eq.lowCut ? track.fx.eq.lowCutFreq || 120 : 20, 0);

      const lowEq = offlineCtx.createBiquadFilter();
      lowEq.type = 'lowshelf';
      lowEq.frequency.setValueAtTime(100, 0);
      lowEq.gain.setValueAtTime(track.fx.eq.low, 0);

      const midEq = offlineCtx.createBiquadFilter();
      midEq.type = 'peaking';
      midEq.frequency.setValueAtTime(2500, 0);
      midEq.gain.setValueAtTime(track.fx.eq.mid, 0);

      const highEq = offlineCtx.createBiquadFilter();
      highEq.type = 'highshelf';
      highEq.frequency.setValueAtTime(10000, 0);
      highEq.gain.setValueAtTime(track.fx.eq.high, 0);

      const compressor = offlineCtx.createDynamicsCompressor();
      const compAmount = track.fx.comp.amount;
      compressor.threshold.setValueAtTime(-10 - compAmount * 24, 0);
      compressor.ratio.setValueAtTime(1.5 + compAmount * 6, 0);
      compressor.attack.setValueAtTime(0.015, 0);
      compressor.release.setValueAtTime(0.12, 0);

      const saturation = offlineCtx.createWaveShaper();
      saturation.curve = this.makeSaturationCurve(track.fx.saturation.amount);

      const compMakeupGain = 1.0 + compAmount * 0.35;
      const trackGain = offlineCtx.createGain();
      trackGain.gain.setValueAtTime(effectiveVol * compMakeupGain, 0);

      lowCut.connect(lowEq);
      lowEq.connect(midEq);
      midEq.connect(highEq);
      highEq.connect(compressor);
      compressor.connect(saturation);
      saturation.connect(trackGain);

      if (track.fx.delay.division !== 'OFF' && track.fx.delay.mix > 0) {
        const secPerBeat = 60 / this.beatData.bpm;
        let delayTime = secPerBeat;
        if (track.fx.delay.division === '1/8') delayTime = secPerBeat * 0.5;
        else if (track.fx.delay.division === '1/2') delayTime = secPerBeat * 2;
        else if (track.fx.delay.division === '1 BAR') delayTime = secPerBeat * 4;

        const delay = offlineCtx.createDelay(4.0);
        delay.delayTime.setValueAtTime(delayTime, 0);
        const delayFeedback = offlineCtx.createGain();
        delayFeedback.gain.setValueAtTime(track.fx.delay.feedback, 0);
        const delayMix = offlineCtx.createGain();
        delayMix.gain.setValueAtTime(track.fx.delay.mix, 0);

        saturation.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(delayMix);
        delayMix.connect(trackGain);
      }

      if (track.fx.reverb.mix > 0) {
        const reverbConvolver = offlineCtx.createConvolver();
        reverbConvolver.buffer = createReverbImpulse(offlineCtx, track.fx.reverb.preset);
        const reverbMix = offlineCtx.createGain();
        reverbMix.gain.setValueAtTime(track.fx.reverb.mix, 0);

        saturation.connect(reverbConvolver);
        reverbConvolver.connect(reverbMix);
        reverbMix.connect(trackGain);
      }

      const panner = offlineCtx.createStereoPanner ? offlineCtx.createStereoPanner() : null;
      if (panner) {
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan ?? 0)), 0);
        trackGain.connect(panner);
        panner.connect(masterGain);
      } else {
        trackGain.connect(masterGain);
      }

      // Render all clips on this track line
      const clips: VocalClip[] = (track.clips && track.clips.length > 0)
        ? track.clips
        : (track.buffer ? [{
            id: `legacy-${track.id}`,
            buffer: track.buffer,
            tunedBuffer: track.tunedBuffer,
            startBeatOffset: track.startBeatOffset,
            duration: track.duration,
          }] : []);

      for (const clip of clips) {
        if (!clip.buffer) continue;
        let playBuffer = clip.buffer;
        if (track.fx.tune?.enabled && track.fx.tune.speed > 0.01) {
          if (clip.tunedBuffer) {
            playBuffer = clip.tunedBuffer;
          } else {
            try {
              playBuffer = await processVocalTune(this.ctx || (offlineCtx as unknown as AudioContext), clip.buffer, track.fx.tune);
            } catch {
              playBuffer = clip.buffer;
            }
          }
        }

        const vSource = offlineCtx.createBufferSource();
        vSource.buffer = playBuffer;
        vSource.connect(lowCut);
        vSource.start(Math.max(0, clip.startBeatOffset));
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWav(renderedBuffer, 24);
  }

  /**
   * Exports Raw Vocal Stems (Dry, without pitch correction or effects).
   * Aligned exactly from 00:00:00 to the end of the song at 24-bit / 48.0 kHz.
   */
  public async exportVocalRawStems(
    vocalTracks: VocalTrack[]
  ): Promise<{ trackId: VocalTrackId; name: string; filename: string; blob: Blob }[]> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado');
    }

    const sampleRate = 48000;
    const duration = this.beatData.duration;
    const length = Math.max(1, Math.ceil(sampleRate * duration));
    const cleanBeatTitle = this.beatData.title.replace(/[^a-zA-Z0-9]/g, '_');

    const stems: { trackId: VocalTrackId; name: string; filename: string; blob: Blob }[] = [];

    for (const track of vocalTracks) {
      const clips: VocalClip[] = (track.clips && track.clips.length > 0)
        ? track.clips
        : (track.buffer ? [{
            id: `stem-${track.id}`,
            buffer: track.buffer,
            startBeatOffset: track.startBeatOffset,
            duration: track.duration,
          }] : []);

      if (clips.length === 0 || !clips.some((c) => c.buffer)) continue;

      // Render 24-bit / 48.0 kHz stereo raw dry stem
      const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
      const stemGain = offlineCtx.createGain();
      stemGain.gain.setValueAtTime(1.0, 0);
      stemGain.connect(offlineCtx.destination);

      for (const clip of clips) {
        if (!clip.buffer) continue;
        const source = offlineCtx.createBufferSource();
        source.buffer = clip.buffer;
        source.connect(stemGain);
        source.start(Math.max(0, clip.startBeatOffset));
      }

      const renderedBuffer = await offlineCtx.startRendering();
      const blob = audioBufferToWav(renderedBuffer, 24);
      const cleanTrackName = track.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `RGODBEAT_${cleanBeatTitle}_STEM_${cleanTrackName}_RAW_DRY_24bit_48k.wav`;

      stems.push({
        trackId: track.id,
        name: `${track.name} (Raw Dry)`,
        filename,
        blob,
      });
    }

    return stems;
  }

  /**
   * Exports Processed Vocal Stems (Wet, with Auto-Tune & FX chains applied in isolation) at 24-bit / 48.0 kHz.
   */
  public async exportProcessedStems(
    vocalTracks: VocalTrack[]
  ): Promise<{ trackId: VocalTrackId; name: string; filename: string; blob: Blob }[]> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado');
    }

    const sampleRate = 48000;
    const duration = this.beatData.duration;
    const cleanBeatTitle = this.beatData.title.replace(/[^a-zA-Z0-9]/g, '_');

    const stems: { trackId: VocalTrackId; name: string; filename: string; blob: Blob }[] = [];

    for (const track of vocalTracks) {
      const clips: VocalClip[] = (track.clips && track.clips.length > 0)
        ? track.clips
        : (track.buffer ? [{
            id: `stem-${track.id}`,
            buffer: track.buffer,
            tunedBuffer: track.tunedBuffer,
            startBeatOffset: track.startBeatOffset,
            duration: track.duration,
          }] : []);

      if (clips.length === 0 || !clips.some((c) => c.buffer)) continue;

      const offlineCtx = new OfflineAudioContext(2, Math.max(1, Math.ceil(sampleRate * duration)), sampleRate);
      const masterGain = offlineCtx.createGain();
      masterGain.gain.setValueAtTime(1.0, 0);
      masterGain.connect(offlineCtx.destination);

      // Vocal FX chain
      const lowCut = offlineCtx.createBiquadFilter();
      lowCut.type = 'highpass';
      lowCut.frequency.setValueAtTime(track.fx.eq.lowCut ? track.fx.eq.lowCutFreq || 120 : 20, 0);

      const lowEq = offlineCtx.createBiquadFilter();
      lowEq.type = 'lowshelf';
      lowEq.frequency.setValueAtTime(100, 0);
      lowEq.gain.setValueAtTime(track.fx.eq.low, 0);

      const midEq = offlineCtx.createBiquadFilter();
      midEq.type = 'peaking';
      midEq.frequency.setValueAtTime(2500, 0);
      midEq.gain.setValueAtTime(track.fx.eq.mid, 0);

      const highEq = offlineCtx.createBiquadFilter();
      highEq.type = 'highshelf';
      highEq.frequency.setValueAtTime(10000, 0);
      highEq.gain.setValueAtTime(track.fx.eq.high, 0);

      const compressor = offlineCtx.createDynamicsCompressor();
      const compAmount = track.fx.comp.amount;
      compressor.threshold.setValueAtTime(-10 - compAmount * 24, 0);
      compressor.ratio.setValueAtTime(1.5 + compAmount * 6, 0);
      compressor.attack.setValueAtTime(0.015, 0);
      compressor.release.setValueAtTime(0.12, 0);

      const saturation = offlineCtx.createWaveShaper();
      saturation.curve = this.makeSaturationCurve(track.fx.saturation.amount);

      const compMakeupGain = 1.0 + compAmount * 0.35;
      const trackGain = offlineCtx.createGain();
      trackGain.gain.setValueAtTime(track.volume * compMakeupGain, 0);

      lowCut.connect(lowEq);
      lowEq.connect(midEq);
      midEq.connect(highEq);
      highEq.connect(compressor);
      compressor.connect(saturation);
      saturation.connect(trackGain);

      if (track.fx.delay.division !== 'OFF' && track.fx.delay.mix > 0) {
        const secPerBeat = 60 / this.beatData.bpm;
        let delayTime = secPerBeat;
        if (track.fx.delay.division === '1/8') delayTime = secPerBeat * 0.5;
        else if (track.fx.delay.division === '1/2') delayTime = secPerBeat * 2;
        else if (track.fx.delay.division === '1 BAR') delayTime = secPerBeat * 4;

        const delay = offlineCtx.createDelay(4.0);
        delay.delayTime.setValueAtTime(delayTime, 0);
        const delayFeedback = offlineCtx.createGain();
        delayFeedback.gain.setValueAtTime(track.fx.delay.feedback, 0);
        const delayMix = offlineCtx.createGain();
        delayMix.gain.setValueAtTime(track.fx.delay.mix, 0);

        saturation.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(delayMix);
        delayMix.connect(trackGain);
      }

      if (track.fx.reverb.mix > 0) {
        const reverbConvolver = offlineCtx.createConvolver();
        reverbConvolver.buffer = createReverbImpulse(offlineCtx, track.fx.reverb.preset);
        const reverbMix = offlineCtx.createGain();
        reverbMix.gain.setValueAtTime(track.fx.reverb.mix, 0);

        saturation.connect(reverbConvolver);
        reverbConvolver.connect(reverbMix);
        reverbMix.connect(trackGain);
      }

      const panner = offlineCtx.createStereoPanner ? offlineCtx.createStereoPanner() : null;
      if (panner) {
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan ?? 0)), 0);
        trackGain.connect(panner);
        panner.connect(masterGain);
      } else {
        trackGain.connect(masterGain);
      }

      for (const clip of clips) {
        if (!clip.buffer) continue;
        let playBuffer = clip.buffer;
        if (track.fx.tune?.enabled && track.fx.tune.speed > 0.01) {
          if (clip.tunedBuffer) {
            playBuffer = clip.tunedBuffer;
          } else {
            try {
              playBuffer = await processVocalTune(this.ctx || (offlineCtx as unknown as AudioContext), clip.buffer, track.fx.tune);
            } catch {
              playBuffer = clip.buffer;
            }
          }
        }

        const vSource = offlineCtx.createBufferSource();
        vSource.buffer = playBuffer;
        vSource.connect(lowCut);
        vSource.start(Math.max(0, clip.startBeatOffset));
      }

      const renderedBuffer = await offlineCtx.startRendering();
      const blob = audioBufferToWav(renderedBuffer, 24);
      const cleanTrackName = track.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `RGODBEAT_${cleanBeatTitle}_STEM_${cleanTrackName}_PROCESSED_WET_24bit_48k.wav`;

      stems.push({
        trackId: track.id,
        name: `${track.name} (Wet FX)`,
        filename,
        blob,
      });
    }

    return stems;
  }

  /**
   * Exports the isolated Beat Stem with active Beat FX at 24-bit / 48.0 kHz.
   */
  public async exportBeatStem(): Promise<{ name: string; filename: string; blob: Blob }> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado');
    }

    const sampleRate = 48000;
    const duration = this.beatData.duration;
    const offlineCtx = new OfflineAudioContext(2, Math.max(1, Math.ceil(sampleRate * duration)), sampleRate);

    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, 0);
    masterGain.connect(offlineCtx.destination);

    const beatHighPass = offlineCtx.createBiquadFilter();
    beatHighPass.type = 'highpass';
    beatHighPass.frequency.setValueAtTime(this.beatFX.highPass, 0);

    const beatLowPass = offlineCtx.createBiquadFilter();
    beatLowPass.type = 'lowpass';
    beatLowPass.frequency.setValueAtTime(this.beatFX.lowPass, 0);

    const beatGain = offlineCtx.createGain();
    beatGain.gain.setValueAtTime(this.beatFX.volume, 0);

    beatHighPass.connect(beatLowPass);
    beatLowPass.connect(beatGain);
    beatGain.connect(masterGain);

    const beatSource = offlineCtx.createBufferSource();
    beatSource.buffer = this.beatData.buffer;
    beatSource.connect(beatHighPass);
    beatSource.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    const blob = audioBufferToWav(renderedBuffer, 24);
    const cleanBeatTitle = this.beatData.title.replace(/[^a-zA-Z0-9]/g, '_');

    return {
      name: 'Beat Instrumental',
      filename: `RGODBEAT_${cleanBeatTitle}_STEM_BEAT_24bit_48k.wav`,
      blob,
    };
  }

  public async updateTuneForTrack(track: VocalTrack): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    if (!track.fx.tune || !track.fx.tune.enabled || track.fx.tune.speed <= 0.01) {
      track.tunedBuffer = null;
      if (track.clips) {
        track.clips.forEach((c) => { c.tunedBuffer = null; });
      }
      return null;
    }
    try {
      if (track.clips && track.clips.length > 0) {
        for (const clip of track.clips) {
          if (clip.buffer) {
            clip.tunedBuffer = await processVocalTune(this.ctx, clip.buffer, track.fx.tune);
          }
        }
      }
      if (track.buffer) {
        const tuned = await processVocalTune(this.ctx, track.buffer, track.fx.tune);
        track.tunedBuffer = tuned;
        return tuned;
      }
      return null;
    } catch (e) {
      console.error('Pitch correction processing error:', e);
      return null;
    }
  }

  public getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyserNode;
  }

  public setLatencyCompensation(ms: number) {
    this.recordingLatencyCompensation = ms / 1000;
  }
}

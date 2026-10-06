import {
  BeatData,
  BeatFX,
  LoopSettings,
  VocalTrack,
  VocalTrackId,
} from '../types/audio';
import { createReverbImpulse } from './reverbImpulse';
import { audioBufferToWav, extractWaveformPeaks, WAVEFORM_SAMPLE_COUNT } from './wavEncoder';
import { processVocalTune } from './pitchCorrection';
import { getProjectDuration, getRenderDuration, getTrackClips } from './clipEditing';
import type { RecordingCheckpoint } from './recordingRecovery';

export interface AudioEngineCallbacks {
  onTimeUpdate: (currentTime: number) => void;
  onPlaybackEnded: () => void;
  onCountInBeat: (beat: number) => void;
  onRecordingFinished: (
    trackId: VocalTrackId,
    buffer: AudioBuffer,
    waveform: number[],
    explicitStartOffset?: number,
    takeId?: string
  ) => void;
  onRecordingAborted: () => void;
  onRecordingCheckpoint?: (checkpoint: RecordingCheckpoint) => void;
  onError: (msg: string) => void;
}

// 1-second silent WAV base64 data URI (valid PCM 16-bit 44.1kHz mono silence)
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private silentAudioEl: HTMLAudioElement | null = null;
  private callbacks: AudioEngineCallbacks;

  // Beat Nodes
  private beatData: BeatData | null = null;
  private beatSource: AudioBufferSourceNode | null = null;
  private beatHighPassNode: BiquadFilterNode | null = null;
  private beatLowPassNode: BiquadFilterNode | null = null;
  private beatGainNode: GainNode | null = null;
  private isBeatMuted: boolean = false;

  // Master
  private masterGainNode: GainNode | null = null;
  private masterLimiterNode: DynamicsCompressorNode | null = null;
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
      delayFilterHp: BiquadFilterNode;
      delayFilterLp: BiquadFilterNode;
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
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micHighPassFilter: BiquadFilterNode | null = null;
  private micInputGain: GainNode | null = null;
  private micInputGainValue = 1.0;
  private micIsClipping = false;
  private micClipTimestamp = 0;
  private micAnalyser: AnalyserNode | null = null;
  private micLevelSamples = new Float32Array(2048);
  private scriptProcessor: ScriptProcessorNode | null = null;
  private pcmRecorder: AudioWorkletNode | null = null;
  private recorderModule: Promise<void> | null = null;
  private recorderSilentGain: GainNode | null = null;
  private captureStartFrame = Infinity;
  private capturedFirstFrame: number | null = null;
  private recorderCommandId = 0;
  private recorderAcks = new Map<number, (frame: number) => void>();
  private recordingRequestId = 0;
  private startingRecording = false;
  private switchingRecording = false;
  private latestVocalTracks: VocalTrack[] = [];
  private disposed = false;
  private recordedPCMChunks: Float32Array[] = [];
  private recordingTakeId = '';
  private recordingStartBeatTime = 0;
  private recordingLatencyCompensation = -0.025; // -25ms default pocket calibration
  private recordingTimelineOrigin = 0;
  private takeLatencyCompensation = -0.025;
  private finalizingRecording: Promise<void> | null = null;

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
   * Prepare buffers while suspended; resume playback only on user interaction.
   */
  public async ensureAudioContext({ resume = true }: { resume?: boolean } = {}): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      try {
        // Optimal audio sweet spot: 'interactive' latency requests the smallest hardware
        // buffer (128-256 samples). Omitting hardcoded sampleRate allows CoreAudio (iOS/Mac)
        // and AAudio (Android) to use the device DAC's native hardware rate directly,
        // eliminating heavy CPU and memory bandwidth kernel resampling.
        this.ctx = new AudioCtxClass({
          latencyHint: 'interactive',
        });
      } catch {
        this.ctx = new AudioCtxClass();
      }
      this.setupMasterGraph();

      // Listen for mobile OS hardware interruptions (incoming phone calls, Siri, alarms)
      this.ctx.onstatechange = () => {
        if (!this.ctx) return;
        if (this.ctx.state === 'interrupted') {
          if (this.isRecording) {
            this.stopRecording();
          } else if (this.isPlaying) {
            this.pause();
          }
        }
      };
    }
    if (resume && (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted')) {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Forces mobile OS (iOS Safari & Android) to elevate the Web Audio session to
   * high-priority Media Playback (Loudspeaker). Bypasses the iPhone physical mute
   * switch and prevents audio from being muted or routed to the earpiece when
   * headphones are not connected.
   *
   * CRITICAL FOR RECORDING STUDIO:
   * When playing audio (and not actively recording), ALWAYS use 'playback' mode.
   * 'playback' routes audio to the high-power stereo loudspeakers at full fidelity,
   * completely bypassing the earpiece/telephone call filter and physical silent switch.
   */
  public triggerMobileSpeakerRouting() {
    if (typeof window === 'undefined') return;
    if (this.isRecording || this.startingRecording) return;
    try {
      if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
        try {
          const session = (navigator as unknown as { audioSession: { type: string } }).audioSession;
          if (session.type !== 'playback') {
            session.type = 'playback';
          }
        } catch {}
        return; // W3C AudioSession API directly elevates OS hardware, no media tag needed
      }

      // Legacy fallback only for old iOS versions (< 16.4) without navigator.audioSession
      if (!this.silentAudioEl) {
        this.silentAudioEl = new Audio(SILENT_WAV_DATA_URI);
        this.silentAudioEl.loop = false;
        this.silentAudioEl.volume = 0.01;
        this.silentAudioEl.setAttribute('playsinline', 'true');
        this.silentAudioEl.setAttribute('webkit-playsinline', 'true');
      }

      const p = this.silentAudioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch {}
  }

  /**
   * Hardware audio unlock for mobile Safari / Chrome.
   * Plays a silent 1-sample buffer and resumes AudioContext synchronously on user gesture.
   */
  public async unlockAudio(): Promise<void> {
    this.triggerMobileSpeakerRouting();
    if (!this.ctx) {
      await this.ensureAudioContext();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted') {
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
    this.masterGainNode.gain.setValueAtTime(0.92, this.ctx.currentTime); // -0.7 dB clean output headroom

    // Master compressor provides headroom for the summed tracks:
    this.masterLimiterNode = this.ctx.createDynamicsCompressor();
    this.masterLimiterNode.threshold.setValueAtTime(-1.8, this.ctx.currentTime);
    this.masterLimiterNode.knee.setValueAtTime(4.0, this.ctx.currentTime);
    this.masterLimiterNode.ratio.setValueAtTime(8.0, this.ctx.currentTime);
    this.masterLimiterNode.attack.setValueAtTime(0.002, this.ctx.currentTime);
    this.masterLimiterNode.release.setValueAtTime(0.045, this.ctx.currentTime);

    this.masterAnalyserNode = this.ctx.createAnalyser();
    this.masterAnalyserNode.fftSize = 128;
    this.masterAnalyserNode.smoothingTimeConstant = 0.8;

    this.masterGainNode.connect(this.masterLimiterNode);
    this.masterLimiterNode.connect(this.masterAnalyserNode);
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

  public setBeat(beat: BeatData | null) {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.beatData = beat;
    this.currentPlaybackPosition = 0;
    this.callbacks.onTimeUpdate(0);
    this.updateLoopBounds();
    if (wasPlaying && beat) {
      this.play();
    }
  }

  public updateBeatBpm(bpm: number) {
    if (!this.beatData) return;
    this.beatData = { ...this.beatData, bpm };
    for (const track of this.latestVocalTracks) this.updateVocalFX(track, this.latestVocalTracks);
    this.updateLoopBounds();
  }

  public getBeat(): BeatData | null {
    return this.beatData;
  }

  public setLoopSettings(loop: LoopSettings) {
    this.loopSettings = { ...loop };
    this.updateLoopBounds();
  }

  private updateLoopBounds() {
    if (!this.beatData) return;
    const secPerBeat = 60 / Math.max(30, this.beatData.bpm);
    const secPerBar = secPerBeat * 4;

    if (this.loopSettings.bars === 'all') {
      this.loopSettings.startSec = 0;
      this.loopSettings.endSec = this.beatData.duration;
    } else {
      const barCount = this.loopSettings.bars;
      const lastBar = Math.max(0, Math.ceil(this.beatData.duration / secPerBar) - 1);
      this.loopSettings.startBar = Math.max(0, Math.min(lastBar, Math.floor(this.loopSettings.startBar)));
      this.loopSettings.startSec = this.loopSettings.startBar * secPerBar;
      this.loopSettings.endSec = Math.min(
        this.beatData.duration,
        this.loopSettings.startSec + barCount * secPerBar
      );
    }
  }

  public setBeatMuted(muted: boolean) {
    this.isBeatMuted = muted;
    if (!this.ctx || !this.beatGainNode) return;
    const vol = muted ? 0 : (typeof this.beatFX?.volume === 'number' ? Math.max(0, Math.min(1.5, this.beatFX.volume)) : 1.0);
    this.beatGainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.03);
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
      const vol = this.isBeatMuted ? 0 : Math.max(0, Math.min(1.5, fx.volume));
      this.beatGainNode.gain.setTargetAtTime(vol, t, 0.05);
    }
  }

  private makeSaturationCurve(amount: number): Float32Array<ArrayBuffer> | null {
    if (amount <= 0) return null;
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
      this.latestVocalTracks = allTracks;
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

        // Analog Tape Vocal Delay Filtering (removes harsh sibilants and low-end mud from echoes)
        const delayFilterHp = this.ctx.createBiquadFilter();
        delayFilterHp.type = 'highpass';
        delayFilterHp.frequency.setValueAtTime(320, t);
        delayFilterHp.Q.setValueAtTime(0.707, t);

        const delayFilterLp = this.ctx.createBiquadFilter();
        delayFilterLp.type = 'lowpass';
        delayFilterLp.frequency.setValueAtTime(3800, t);
        delayFilterLp.Q.setValueAtTime(0.707, t);

        // Feedback loop: delay -> HP (320Hz) -> LP (3800Hz) -> feedback gain -> delay
        delay.connect(delayFilterHp);
        delayFilterHp.connect(delayFilterLp);
        delayFilterLp.connect(delayFeedback);
        delayFeedback.connect(delay);
        // Wet send to mix
        delayFilterLp.connect(delayMix);

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
          delayFilterHp,
          delayFilterLp,
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
      nodes.compressor.threshold.setTargetAtTime(compAmount > 0 ? -10 - compAmount * 24 : 0, t, 0.05);
      nodes.compressor.ratio.setTargetAtTime(compAmount > 0 ? 1.5 + compAmount * 6 : 1, t, 0.05);

      nodes.saturation.curve = this.makeSaturationCurve(track.fx.saturation.amount);

      if (this.beatData && track.fx.delay.division !== 'OFF') {
        const secPerBeat = 60 / Math.max(30, this.beatData.bpm);
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
        nodes.delay.delayTime.setTargetAtTime(delayTimeSec, t, 0.08);
        const safeFeedback = Math.max(0, Math.min(0.75, track.fx.delay.feedback));
        nodes.delayFeedback.gain.setTargetAtTime(safeFeedback, t, 0.04);
        nodes.delayMix.gain.setTargetAtTime(Math.max(0, Math.min(1, track.fx.delay.mix)), t, 0.04);
      } else {
        // Pop-free smooth fade to 0
        nodes.delayMix.gain.setTargetAtTime(0, t, 0.03);
        nodes.delayFeedback.gain.setTargetAtTime(0, t, 0.03);
      }

      const impulse = this.getReverbImpulse(track.fx.reverb.preset);
      if (impulse && nodes.reverbConvolver.buffer !== impulse) {
        // Replace the convolver when changing presets; keep its wet output routing.
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
      if (track.isMuted || (this.isRecording && this.recordingTrackId === track.id)) {
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

  public async play(vocalTracks: VocalTrack[] = this.latestVocalTracks) {
    this.latestVocalTracks = vocalTracks;
    if (!this.beatData) {
      console.warn('AudioEngine: cannot play, no beatData loaded');
      return;
    }

    // Force loudspeaker media route for devices without headphones plugged in
    this.triggerMobileSpeakerRouting();
    await this.unlockAudio();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('AudioEngine: error resuming AudioContext in play():', err);
      }
    }

    if (this.isPlaying) {
      this.stopSources();
    }

    // Ensure beat gain and master gain nodes are configured and audible
    if (this.beatGainNode) {
      const vol = this.isBeatMuted
        ? 0
        : (typeof this.beatFX?.volume === 'number' ? Math.max(0, Math.min(1.5, this.beatFX.volume)) : 1.0);
      try {
        this.beatGainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        this.beatGainNode.gain.setValueAtTime(vol, this.ctx.currentTime);
      } catch {
        this.beatGainNode.gain.value = vol;
      }
    }
    if (this.masterGainNode) {
      try {
        this.masterGainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGainNode.gain.setValueAtTime(0.92, this.ctx.currentTime);
      } catch {
        this.masterGainNode.gain.value = 0.92;
      }
    }

    // If playhead was at or beyond duration, restart from loop start or 0
    if (this.currentPlaybackPosition >= getProjectDuration(this.beatData.duration, vocalTracks) - 0.001) {
      this.currentPlaybackPosition = this.loopSettings.enabled ? this.loopSettings.startSec : 0;
    }

    if (this.loopSettings.enabled && (this.currentPlaybackPosition < this.loopSettings.startSec || this.currentPlaybackPosition >= this.loopSettings.endSec)) {
      this.currentPlaybackPosition = this.loopSettings.startSec;
    }
    const startPos = this.currentPlaybackPosition;
    // 45ms lookahead ensures all tracks/clips on mobile WebAudio are tightly synchronized without stutter
    const scheduleLeadTime = 0.045;
    const startTime = this.ctx.currentTime + scheduleLeadTime;
    this.playbackStartCtxTime = startTime - startPos;

    // 1. Start Beat Source (with multi-stage routing fallback)
    if (this.beatData.buffer && startPos < this.beatData.buffer.duration) {
      this.beatSource = this.ctx.createBufferSource();
      this.beatSource.buffer = this.beatData.buffer;
      if (this.beatHighPassNode) {
        this.beatSource.connect(this.beatHighPassNode);
      } else if (this.beatGainNode) {
        this.beatSource.connect(this.beatGainNode);
      } else if (this.masterGainNode) {
        this.beatSource.connect(this.masterGainNode);
      } else {
        this.beatSource.connect(this.ctx.destination);
      }
      this.beatSource.start(startTime, startPos);
    } else {
      console.warn('AudioEngine: beatData exists but has no AudioBuffer');
    }

    // 2. Start all active vocal tracks that have takes/clips
    for (const track of vocalTracks) {
      try {
        // In professional DAWs (Pro Tools, Logic Pro, Ableton, FL Studio):
        // If this track is the one currently recording, its previous take is MUTED from playback
        // so the artist does NOT hear their old take clashing with their live singing!
        if (this.isRecording && this.recordingTrackId === track.id) {
          continue;
        }

        this.updateVocalFX(track, vocalTracks);
        const trackNodes = this.vocalNodes.get(track.id);
        if (!trackNodes) continue;

        // Schedule every track; gains implement mute/solo so toggles work during playback.
        // Extract all clips for this track line (or fallback to track.buffer)
        const clips = getTrackClips(track);

        for (const clip of clips) {
          if (!clip.buffer) continue;
          const trackOffset = clip.startBeatOffset || 0;

          const playBuffer = (track.fx.tune?.enabled && track.fx.tune.speed > 0.01 && clip.tunedBuffer)
            ? clip.tunedBuffer
            : clip.buffer;
          // Decoded samples are authoritative; old project metadata can be stale.
          const trackDur = playBuffer.duration;

          const sourceKey = `${track.id}-${clip.id}`;

          if (startPos < trackOffset) {
            const source = this.ctx.createBufferSource();
            source.buffer = playBuffer;
            source.connect(trackNodes.lowCut);
            const when = Math.max(startTime, this.playbackStartCtxTime + trackOffset);
            source.start(when, 0);
            this.vocalSources.set(sourceKey, source);
          } else if (startPos >= trackOffset && startPos < trackOffset + trackDur) {
            const offsetInTake = Math.max(0, startPos - trackOffset);
            if (offsetInTake < playBuffer.duration - 0.01) {
              const source = this.ctx.createBufferSource();
              source.buffer = playBuffer;
              source.connect(trackNodes.lowCut);
              source.start(startTime, offsetInTake);
              this.vocalSources.set(sourceKey, source);
            }
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
    if (this.isRecording || this.isFinalizingRecording) {
      void this.stopRecording();
    } else {
      ++this.recordingRequestId;
      this.releaseMicrophone();
    }
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
    const maxDur = getProjectDuration(this.beatData?.duration ?? 0, vocalTracks);
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
    for (const nodes of this.vocalNodes.values()) {
      for (const node of Object.values(nodes)) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
    }
    this.vocalNodes.clear();
  }

  /**
   * Immediately stops and disconnects all active audio buffer sources for a specific track.
   * Essential for clean take replacement when punch-in or re-recording on a channel.
   */
  public clearTrackSources(trackId: VocalTrackId) {
    for (const [key, source] of this.vocalSources.entries()) {
      if (key.startsWith(`${trackId}-`)) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // ignore
        }
        this.vocalSources.delete(key);
      }
    }
  }

  private startPositionTracker(vocalTracks: VocalTrack[]) {
    this.latestVocalTracks = vocalTracks;
    const trackLoop = () => {
      if (!this.isPlaying || !this.ctx || !this.beatData) return;

      const elapsed = Math.max(this.currentPlaybackPosition, this.ctx.currentTime - this.playbackStartCtxTime);
      this.currentPlaybackPosition = elapsed;
      this.callbacks.onTimeUpdate(elapsed);

      if (this.loopSettings.enabled && elapsed >= this.loopSettings.endSec) {
        if (this.isRecording) {
          void this.stopRecording();
          this.callbacks.onPlaybackEnded();
        } else {
          this.seek(this.loopSettings.startSec, this.latestVocalTracks);
        }
        return;
      }

      if (elapsed >= (this.isRecording ? getProjectDuration(this.beatData.duration, this.latestVocalTracks) : getRenderDuration(this.beatData.duration, this.latestVocalTracks, this.beatData.bpm))) {
        if (this.loopSettings.enabled) {
          this.seek(this.loopSettings.startSec, this.latestVocalTracks);
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
      const liveTracks = this.micStream.getAudioTracks().filter((t) => t.readyState === 'live');
      if (liveTracks.length > 0) {
        return this.micStream;
      }
    }

    // 1. Completely release any legacy silent audio element so it cannot tie up the audio session
    if (this.silentAudioEl) {
      try {
        this.silentAudioEl.pause();
        this.silentAudioEl.removeAttribute('src');
        this.silentAudioEl.load();
        this.silentAudioEl = null;
      } catch {}
    }

    // 2. iOS WebKit AudioSession MUST be in 'play-and-record' mode before calling getUserMedia
    // NEVER allow it to stay in 'playback' because WebKit throws 'Cannot connect to audio session'
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        const audioSession = (navigator as unknown as { audioSession: { type: string } }).audioSession;
        if (audioSession.type !== 'play-and-record') {
          audioSession.type = 'play-and-record';
          // Allow WebKit's IPC to notify mediaserverd of the category change
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      } catch (e) {
        console.warn('Could not set audioSession to play-and-record:', e);
      }
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
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (error) {
      // Retry only unsupported constraints; permission and hardware errors need user action.
      if (!(error instanceof DOMException) || error.name !== 'OverconstrainedError') throw error;
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    return this.micStream;
  }

  /** Request microphone access directly from the REC gesture, before any async backup work. */
  public async prepareMicrophone(): Promise<boolean> {
    try {
      await this.getMicrophoneStream();
      return true;
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.callbacks.onError(denied
        ? 'Permiso de micrófono denegado. Permite el acceso en los ajustes del navegador.'
        : `No se pudo iniciar la grabación: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Releases hardware microphone tracks immediately so iOS and Android exit
   * Voice-Communication / Call mode and instantly restore uncompressed Hi-Fi stereo playback.
   */
  public releaseMicrophone() {
    if (this.isFinalizingRecording && !this.disposed) return;
    if (this.scriptProcessor) this.scriptProcessor.onaudioprocess = null;
    if (this.pcmRecorder) this.pcmRecorder.port.onmessage = null;
    for (const node of [this.micSource, this.micHighPassFilter, this.micInputGain,
      this.micAnalyser, this.scriptProcessor, this.pcmRecorder, this.recorderSilentGain]) {
      try { node?.disconnect(); } catch { /* Already disconnected. */ }
    }
    this.micSource = null;
    this.micHighPassFilter = null;
    this.micInputGain = null;
    this.micAnalyser = null;
    this.scriptProcessor = null;
    this.pcmRecorder = null;
    this.recorderSilentGain = null;
    for (const resolve of this.recorderAcks.values()) resolve(this.ctx?.currentTime ? Math.round(this.ctx.currentTime * this.ctx.sampleRate) : 0);
    this.recorderAcks.clear();

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

    // Immediately restore uncompressed, full-frequency Hi-Fi playback through main speakers.
    // Exits the phone call / earpiece routing mode so everything sounds crystal clear!
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        const session = (navigator as unknown as { audioSession: { type: string } }).audioSession;
        session.type = 'playback';
      } catch {
        // ignore
      }
    }
  }

  private collectPCM(samples: Float32Array, frame: number) {
    if (!this.ctx) return;
    // Keep the capture clock fixed for the whole recording, including late worklet messages.
    const start = frame / this.ctx.sampleRate - this.recordingTimelineOrigin + this.takeLatencyCompensation;
    const skip = Math.min(samples.length, Math.max(0, Math.round(-start * this.ctx.sampleRate)));
    if (skip === samples.length) return;
    if (skip) samples = samples.slice(skip);
    if (this.capturedFirstFrame === null) {
      this.capturedFirstFrame = frame + skip;
      this.recordingStartBeatTime = Math.max(0, start + skip / this.ctx.sampleRate);
    }
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    if (peak >= 0.88) {
      this.micIsClipping = true;
      this.micClipTimestamp = Date.now();
      const target = Math.max(0.32, this.micInputGainValue * (peak > 0.98 ? 0.78 : 0.85));
      this.micInputGainValue = target;
      this.micInputGain?.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    } else if (Date.now() - this.micClipTimestamp > 1200) {
      this.micIsClipping = false;
    }
    // Store the captured PCM unchanged; hardware clipping cannot be repaired by a soft clipper.
    this.recordedPCMChunks.push(samples);
    if (this.recordingTrackId) this.callbacks.onRecordingCheckpoint?.({
      takeId: this.recordingTakeId, trackId: this.recordingTrackId,
      start: this.recordingStartBeatTime, sampleRate: this.ctx.sampleRate,
      index: this.recordedPCMChunks.length - 1, samples,
    });
  }

  private async setupPCMRecorder() {
    if (!this.ctx || !this.micInputGain) throw new Error('Micrófono no inicializado.');
    const ctx = this.ctx;
    this.recorderSilentGain = ctx.createGain();
    this.recorderSilentGain.gain.value = 0;
    this.recorderSilentGain.connect(ctx.destination);
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        this.recorderModule ??= ctx.audioWorklet.addModule('/studio/pcm-recorder.js');
        await this.recorderModule;
        if (this.disposed || !this.isRecording) return;
        this.pcmRecorder = new AudioWorkletNode(ctx, 'rgodbeat-pcm-recorder', {
          channelCount: 1, numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        });
        this.pcmRecorder.port.onmessage = ({ data }) => {
          if (data.type === 'chunk') this.collectPCM(data.samples, data.frame);
          else if (data.type === 'ack') {
            this.recorderAcks.get(data.id)?.(data.frame);
            this.recorderAcks.delete(data.id);
          }
        };
        this.pcmRecorder.onprocessorerror = () => {
          this.callbacks.onError('El capturador de audio se interrumpió. Se guardará la toma recibida.');
          void this.stopRecording();
        };
        this.micInputGain.connect(this.pcmRecorder);
        this.pcmRecorder.connect(this.recorderSilentGain);
        return;
      } catch (error) {
        this.recorderModule = null;
        console.warn('AudioWorklet unavailable; using PCM compatibility capture:', error);
      }
    }
    this.scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);
    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRecording) return;
      const input = event.inputBuffer.getChannelData(0);
      const frame = Math.round((event.playbackTime - input.length / ctx.sampleRate) * ctx.sampleRate);
      const skip = Math.max(0, this.captureStartFrame - frame);
      if (skip < input.length) this.collectPCM(input.slice(skip), frame + skip);
    };
    this.micInputGain.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.recorderSilentGain);
  }

  private async flushRecorder(type: 'boundary' | 'stop'): Promise<number> {
    if (!this.ctx) return 0;
    const frame = Math.round(this.ctx.currentTime * this.ctx.sampleRate);
    if (!this.pcmRecorder) return frame;
    const node = this.pcmRecorder;
    const id = ++this.recorderCommandId;
    return new Promise<number>((resolve) => {
      const timer = setTimeout(() => {
        this.recorderAcks.delete(id);
        this.callbacks.onError('El capturador no respondió a tiempo. Se conservará el audio recibido.');
        resolve(frame);
      }, 1500);
      this.recorderAcks.set(id, (boundaryFrame) => { clearTimeout(timer); resolve(boundaryFrame); });
      node.port.postMessage({ type, id });
    });
  }

  private commitRecordedPCM(trackId: VocalTrackId, start: number, chunks: Float32Array[], takeId = this.recordingTakeId) {
    if (!this.ctx) return;
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!length) return;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    this.callbacks.onRecordingFinished(trackId, buffer, extractWaveformPeaks(buffer, WAVEFORM_SAMPLE_COUNT), start, takeId);
  }

  public getRecordingCheckpointClip() {
    if (!this.ctx || !this.recordingTrackId || !this.recordedPCMChunks.length) return null;
    const length = this.recordedPCMChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    let offset = 0;
    for (const chunk of this.recordedPCMChunks) { buffer.getChannelData(0).set(chunk, offset); offset += chunk.length; }
    return { trackId: this.recordingTrackId, clip: {
      id: this.recordingTakeId, name: 'Toma en curso', buffer, tunedBuffer: null,
      startBeatOffset: this.recordingStartBeatTime, duration: buffer.duration, isLocked: true,
    } };
  }

  public async startRecording(trackId: VocalTrackId, vocalTracks: VocalTrack[], withCountIn = true): Promise<boolean> {
    if (this.startingRecording || this.isRecording || this.isFinalizingRecording || this.disposed) return false;
    if (!this.beatData) { this.callbacks.onError('Por favor carga un beat primero.'); return false; }
    this.startingRecording = true;
    this.captureStartFrame = Infinity;
    const requestId = ++this.recordingRequestId;
    try {
      const stream = await this.getMicrophoneStream();
      if (requestId !== this.recordingRequestId || this.disposed) { this.releaseMicrophone(); return false; }
      await this.ensureAudioContext();
      if (!this.ctx || requestId !== this.recordingRequestId) return false;
      const wasPlaying = this.isPlaying;
      this.recordingTrackId = trackId;
      this.recordingTakeId = `take-${crypto.randomUUID()}`;
      this.isRecording = true;
      this.recordedPCMChunks = [];
      this.capturedFirstFrame = null;
      this.captureStartFrame = Infinity;
      this.micInputGainValue = 1;
      this.micIsClipping = false;
      this.micClipTimestamp = 0;
      if (withCountIn && !wasPlaying) {
        const interval = 60000 / this.beatData.bpm;
        const countStart = performance.now();
        for (let beat = 1; beat <= 4; beat++) {
          if (requestId !== this.recordingRequestId || !this.isRecording) return false;
          this.callbacks.onCountInBeat(beat);
          this.playClick(beat === 1 ? 1200 : 800, 0.06);
          while (performance.now() < countStart + beat * interval) {
            if (requestId !== this.recordingRequestId || !this.isRecording) return false;
            await new Promise(resolve => setTimeout(resolve, 15));
          }
        }
      }
      this.callbacks.onCountInBeat(0);
      if (requestId !== this.recordingRequestId || !this.isRecording) return false;
      this.micSource = this.ctx.createMediaStreamSource(stream);
      this.micHighPassFilter = this.ctx.createBiquadFilter();
      this.micHighPassFilter.type = 'highpass';
      this.micHighPassFilter.frequency.value = 35;
      this.micHighPassFilter.Q.value = 0.7071;
      this.micInputGain = this.ctx.createGain();
      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 2048;
      this.micSource.connect(this.micHighPassFilter);
      this.micHighPassFilter.connect(this.micInputGain);
      this.micInputGain.connect(this.micAnalyser);
      await this.setupPCMRecorder();
      if (requestId !== this.recordingRequestId || !this.isRecording) return false;
      this.clearTrackSources(trackId);
      if (!wasPlaying) await this.play(vocalTracks);
      if (requestId !== this.recordingRequestId || !this.isRecording) return false;
      const start = Math.max(this.ctx.currentTime, this.playbackStartCtxTime + this.currentPlaybackPosition);
      this.recordingTimelineOrigin = this.playbackStartCtxTime;
      this.takeLatencyCompensation = this.recordingLatencyCompensation;
      this.captureStartFrame = Math.ceil(start * this.ctx.sampleRate);
      this.recordingStartBeatTime = Math.max(0, start - this.recordingTimelineOrigin + this.takeLatencyCompensation);
      this.pcmRecorder?.port.postMessage({ type: 'start', startFrame: this.captureStartFrame });
      return true;
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.callbacks.onError(denied
        ? 'Permiso de micrófono denegado. Permite el acceso en los ajustes del navegador.'
        : `No se pudo iniciar la grabación: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      this.startingRecording = false;
      if (requestId !== this.recordingRequestId || this.captureStartFrame === Infinity) {
        if (this.finalizingRecording) await this.finalizingRecording;
        this.isRecording = false;
        this.recordingTrackId = null;
        this.releaseMicrophone();
        this.callbacks.onCountInBeat(0);
        this.callbacks.onRecordingAborted();
      }
    }
  }

  public async switchRecordingTrack(newTrackId: VocalTrackId, vocalTracks: VocalTrack[]): Promise<boolean> {
    if (!this.isRecording || !this.ctx || !this.recordingTrackId || this.startingRecording || this.switchingRecording) return false;
    if (this.recordingTrackId === newTrackId) return true;
    this.switchingRecording = true;
    try {
      const previousTrackId = this.recordingTrackId;
      const boundary = await this.flushRecorder('boundary');
      if (!this.isRecording || this.isFinalizingRecording) return false;
      const start = this.recordingStartBeatTime;
      const chunks = this.recordedPCMChunks;
      const takeId = this.recordingTakeId;
      this.recordedPCMChunks = [];
      this.capturedFirstFrame = null;
      this.recordingTrackId = newTrackId;
      this.recordingTakeId = `take-${crypto.randomUUID()}`;
      this.recordingStartBeatTime = Math.max(0, boundary / this.ctx.sampleRate - this.recordingTimelineOrigin + this.takeLatencyCompensation);
      this.clearTrackSources(newTrackId);
      this.latestVocalTracks = vocalTracks;
      this.commitRecordedPCM(previousTrackId, start, chunks, takeId);
      return true;
    } finally { this.switchingRecording = false; }
  }

  public abortCountIn(): void {
    if (!this.startingRecording) return;
    ++this.recordingRequestId;
    this.isRecording = false;
    this.recordingTrackId = null;
    this.callbacks.onCountInBeat(0);
    this.releaseMicrophone();
    this.callbacks.onRecordingAborted();
  }

  public stopRecording(): Promise<void> {
    ++this.recordingRequestId;
    if (this.finalizingRecording) return this.finalizingRecording;
    this.isFinalizingRecording = true;
    this.finalizingRecording = this.finishRecording().finally(() => {
      this.finalizingRecording = null;
    });
    return this.finalizingRecording;
  }

  private async finishRecording(): Promise<void> {
    try {
      this.callbacks.onCountInBeat(0);
      const trackId = this.recordingTrackId;
      this.isRecording = false;
      this.pause();
      await this.flushRecorder('stop');
      this.recordingTrackId = null;
      const chunks = this.recordedPCMChunks;
      this.recordedPCMChunks = [];
      if (trackId && chunks.some(chunk => chunk.length > 0)) {
        this.commitRecordedPCM(trackId, this.recordingStartBeatTime, chunks);
      } else {
        this.callbacks.onRecordingAborted();
      }
    } finally {
      this.captureStartFrame = Infinity;
      this.isFinalizingRecording = false;
      this.releaseMicrophone();
    }
  }

  public dispose() {
    this.disposed = true;
    ++this.recordingRequestId;
    this.isRecording = false;
    this.stopSources();
    this.isPlaying = false;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.releaseMicrophone();
    if (this.ctx) { this.ctx.onstatechange = null; void this.ctx.close(); }
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

    const waveform = extractWaveformPeaks(buffer, WAVEFORM_SAMPLE_COUNT);
    return { buffer, waveform };
  }

  public getMicInputLevel(): number {
    if (!this.micAnalyser) return 0;
    this.micAnalyser.getFloatTimeDomainData(this.micLevelSamples);
    let peak = 0;
    for (const sample of this.micLevelSamples) peak = Math.max(peak, Math.abs(sample));
    return Math.min(1, peak);
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

  public getRecordingTrackId(): VocalTrackId | null {
    return this.recordingTrackId;
  }

  public getCurrentPlaybackPosition(): number {
    return this.currentPlaybackPosition;
  }

  /** Use the recorded audio's actual rate instead of forcing an export upgrade. */
  public getExportSampleRate(vocalTracks: VocalTrack[] = []): number {
    const recordedRate = vocalTracks.reduce((rate, track) =>
      getTrackClips(track).reduce((maxRate, clip) => Math.max(maxRate, clip.buffer?.sampleRate ?? 0), rate), 0);
    return recordedRate || this.beatData?.buffer.sampleRate || this.ctx?.sampleRate || 44100;
  }

  public async exportMix(
    vocalTracks: VocalTrack[],
    options?: { sidechainDb?: number; enableSidechain?: boolean }
  ): Promise<Blob> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado para exportar');
    }

    // Compact 24-bit master at the actual recorded sample rate.
    const TARGET_SAMPLE_RATE = this.getExportSampleRate(vocalTracks);
    const duration = getRenderDuration(this.beatData.duration, vocalTracks, this.beatData.bpm);
    const length = Math.max(1, Math.ceil(TARGET_SAMPLE_RATE * duration));

    const offlineCtx = new OfflineAudioContext(2, length, TARGET_SAMPLE_RATE);

    // 1. Master Gain
    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(0.92, 0);
    const limiter = offlineCtx.createDynamicsCompressor();
    limiter.threshold.value = -1.8;
    limiter.knee.value = 4;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.045;
    masterGain.connect(limiter);
    limiter.connect(offlineCtx.destination);

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
    beatBassGain.gain.setValueAtTime(this.isBeatMuted ? 0 : this.beatFX.volume, 0);

    beatLowPass.connect(beatBassFilter);
    beatBassFilter.connect(beatBassGain);
    beatBassGain.connect(masterGain);

    // Branch B: Medios & Agudos (Vocal clash pocket, ducked smoothly when vocal sings)
    const beatMidHighGain = offlineCtx.createGain();
    const invertedBass = offlineCtx.createGain();
    invertedBass.gain.value = -1;
    beatLowPass.connect(beatMidHighGain);
    beatBassFilter.connect(invertedBass);
    invertedBass.connect(beatMidHighGain);
    beatMidHighGain.connect(masterGain);

    // 3. Dynamic Sidechain Ducking Calculation on the Mid/High Branch
    const sidechainDb = options?.sidechainDb ?? 3.0;
    const enableSidechain = options?.enableSidechain ?? true;

    if (enableSidechain && vocalTracks.some((t) => (t.buffer || (t.clips && t.clips.length > 0)) && !t.isMuted)) {
      const stepSec = 0.01; // 10ms sampling interval
      const numSteps = Math.max(2, Math.ceil(duration / stepSec));
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
        const clips = getTrackClips(track);

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
        curve[s] = currentVal * (this.isBeatMuted ? 0 : this.beatFX.volume);
      }

      beatMidHighGain.gain.setValueCurveAtTime(curve, 0, duration);
    } else {
      beatMidHighGain.gain.setValueAtTime(this.isBeatMuted ? 0 : this.beatFX.volume, 0);
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
      const compAmount = Math.max(0, Math.min(1, track.fx.comp.amount));
      compressor.threshold.setValueAtTime(compAmount > 0 ? -10 - compAmount * 24 : 0, 0);
      compressor.ratio.setValueAtTime(compAmount > 0 ? 1.5 + compAmount * 6 : 1, 0);
      compressor.attack.setValueAtTime(0.015, 0);
      compressor.release.setValueAtTime(0.12, 0);

      const saturation = offlineCtx.createWaveShaper();
      saturation.curve = this.makeSaturationCurve(track.fx.saturation.amount);
      saturation.oversample = '2x';

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
        const secPerBeat = 60 / Math.max(30, this.beatData.bpm);
        let delayTime = secPerBeat;
        if (track.fx.delay.division === '1/8') delayTime = secPerBeat * 0.5;
        else if (track.fx.delay.division === '1/2') delayTime = secPerBeat * 2;
        else if (track.fx.delay.division === '1 BAR') delayTime = secPerBeat * 4;

        const delay = offlineCtx.createDelay(4.0);
        delay.delayTime.setValueAtTime(delayTime, 0);
        const delayFeedback = offlineCtx.createGain();
        delayFeedback.gain.setValueAtTime(Math.min(0.75, track.fx.delay.feedback), 0);
        const delayMix = offlineCtx.createGain();
        delayMix.gain.setValueAtTime(track.fx.delay.mix, 0);

        const delayFilterHp = offlineCtx.createBiquadFilter();
        delayFilterHp.type = 'highpass';
        delayFilterHp.frequency.setValueAtTime(320, 0);
        delayFilterHp.Q.setValueAtTime(0.707, 0);

        const delayFilterLp = offlineCtx.createBiquadFilter();
        delayFilterLp.type = 'lowpass';
        delayFilterLp.frequency.setValueAtTime(3800, 0);
        delayFilterLp.Q.setValueAtTime(0.707, 0);

        saturation.connect(delay);
        delay.connect(delayFilterHp);
        delayFilterHp.connect(delayFilterLp);
        delayFilterLp.connect(delayFeedback);
        delayFeedback.connect(delay);
        delayFilterLp.connect(delayMix);
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
      const clips = getTrackClips(track);

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
    let peak = 0;
    for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
      for (const sample of renderedBuffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.99) {
      const gain = 0.99 / peak;
      for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch++) {
        const data = renderedBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) data[i] *= gain;
      }
    }
    return audioBufferToWav(renderedBuffer, 24);
  }

  /**
   * Exports Raw Vocal Stems (Dry, without pitch correction or effects).
   * Aligned from 00:00:00 at the recording's sample rate, without PCM quantization.
   */
  public async exportVocalRawStems(
    vocalTracks: VocalTrack[]
  ): Promise<{ trackId: VocalTrackId; name: string; filename: string; blob: Blob }[]> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado');
    }

    const sampleRate = this.getExportSampleRate(vocalTracks);
    const duration = getRenderDuration(this.beatData.duration, vocalTracks, this.beatData.bpm);
    const length = Math.max(1, Math.ceil(sampleRate * duration));
    const cleanBeatTitle = this.beatData.title.replace(/[^a-zA-Z0-9]/g, '_');

    const stems: { trackId: VocalTrackId; name: string; filename: string; blob: Blob }[] = [];

    for (const track of vocalTracks) {
      const clips = getTrackClips(track);

      if (clips.length === 0 || !clips.some((c) => c.buffer)) continue;

      // Phone recordings stay mono; imported clips retain their channel count.
      const channels = clips.reduce((max, clip) => Math.max(max, clip.buffer?.numberOfChannels ?? 1), 1);
      const offlineCtx = new OfflineAudioContext(channels, length, sampleRate);
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
      const blob = audioBufferToWav(renderedBuffer, 32);
      const cleanTrackName = track.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `RGODBEAT_${cleanBeatTitle}_STEM_${cleanTrackName}_RAW_DRY_32bit_float_${sampleRate}Hz.wav`;

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
   * Exports processed vocal stems as float WAV to preserve FX headroom at the recorded rate.
   */
  public async exportProcessedStems(
    vocalTracks: VocalTrack[]
  ): Promise<{ trackId: VocalTrackId; name: string; filename: string; blob: Blob }[]> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado');
    }

    const sampleRate = this.getExportSampleRate(vocalTracks);
    const duration = getRenderDuration(this.beatData.duration, vocalTracks, this.beatData.bpm);
    const cleanBeatTitle = this.beatData.title.replace(/[^a-zA-Z0-9]/g, '_');

    const stems: { trackId: VocalTrackId; name: string; filename: string; blob: Blob }[] = [];

    for (const track of vocalTracks) {
      const clips = getTrackClips(track);

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
      const compAmount = Math.max(0, Math.min(1, track.fx.comp.amount));
      compressor.threshold.setValueAtTime(compAmount > 0 ? -10 - compAmount * 24 : 0, 0);
      compressor.ratio.setValueAtTime(compAmount > 0 ? 1.5 + compAmount * 6 : 1, 0);
      compressor.attack.setValueAtTime(0.015, 0);
      compressor.release.setValueAtTime(0.12, 0);

      const saturation = offlineCtx.createWaveShaper();
      saturation.curve = this.makeSaturationCurve(track.fx.saturation.amount);
      saturation.oversample = '2x';

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
        const secPerBeat = 60 / Math.max(30, this.beatData.bpm);
        let delayTime = secPerBeat;
        if (track.fx.delay.division === '1/8') delayTime = secPerBeat * 0.5;
        else if (track.fx.delay.division === '1/2') delayTime = secPerBeat * 2;
        else if (track.fx.delay.division === '1 BAR') delayTime = secPerBeat * 4;

        const delay = offlineCtx.createDelay(4.0);
        delay.delayTime.setValueAtTime(delayTime, 0);
        const delayFeedback = offlineCtx.createGain();
        delayFeedback.gain.setValueAtTime(Math.min(0.75, track.fx.delay.feedback), 0);
        const delayMix = offlineCtx.createGain();
        delayMix.gain.setValueAtTime(track.fx.delay.mix, 0);

        const delayFilterHp = offlineCtx.createBiquadFilter();
        delayFilterHp.type = 'highpass';
        delayFilterHp.frequency.setValueAtTime(320, 0);
        delayFilterHp.Q.setValueAtTime(0.707, 0);

        const delayFilterLp = offlineCtx.createBiquadFilter();
        delayFilterLp.type = 'lowpass';
        delayFilterLp.frequency.setValueAtTime(3800, 0);
        delayFilterLp.Q.setValueAtTime(0.707, 0);

        saturation.connect(delay);
        delay.connect(delayFilterHp);
        delayFilterHp.connect(delayFilterLp);
        delayFilterLp.connect(delayFeedback);
        delayFeedback.connect(delay);
        delayFilterLp.connect(delayMix);
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
      const blob = audioBufferToWav(renderedBuffer, 32);
      const cleanTrackName = track.name.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `RGODBEAT_${cleanBeatTitle}_STEM_${cleanTrackName}_PROCESSED_WET_32bit_float_${sampleRate}Hz.wav`;

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
   * Exports the isolated beat with active FX as float WAV at the project rate.
   */
  public async exportBeatStem(vocalTracks: VocalTrack[] = []): Promise<{ name: string; filename: string; blob: Blob }> {
    if (!this.beatData) {
      throw new Error('No hay beat cargado');
    }

    const sampleRate = this.getExportSampleRate(vocalTracks);
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
    const blob = audioBufferToWav(renderedBuffer, 32);
    const cleanBeatTitle = this.beatData.title.replace(/[^a-zA-Z0-9]/g, '_');

    return {
      name: 'Beat Instrumental',
      filename: `RGODBEAT_${cleanBeatTitle}_STEM_BEAT_32bit_float_${sampleRate}Hz.wav`,
      blob,
    };
  }

  public async updateTuneForTrack(track: VocalTrack, signal?: AbortSignal): Promise<AudioBuffer | null> {
    if (!this.ctx || !track.fx.tune.enabled || track.fx.tune.speed <= 0.01) return null;
    const clips = getTrackClips(track);
    for (const clip of clips) {
      if (signal?.aborted) return null;
      clip.tunedBuffer = await processVocalTune(this.ctx, clip.buffer, track.fx.tune, signal);
    }
    track.tunedBuffer = clips.at(-1)?.tunedBuffer ?? null;
    return track.tunedBuffer ?? null;
  }

  public getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyserNode;
  }

  public setLatencyCompensation(ms: number) {
    this.recordingLatencyCompensation = ms / 1000;
  }
}

/* global AudioWorkletProcessor, currentFrame, registerProcessor */
// PCM capture runs on the audio thread. No microphone audio is sent to speakers.
class StudioPCMRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.startFrame = Infinity;
    this.chunk = new Float32Array(4096);
    this.length = 0;
    this.firstFrame = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        this.length = 0;
        this.startFrame = data.startFrame;
        this.recording = true;
      } else if (data.type === 'boundary' || data.type === 'stop') {
        this.flush();
        if (data.type === 'stop') this.recording = false;
        this.port.postMessage({ type: 'ack', id: data.id, frame: currentFrame });
      }
    };
  }

  flush() {
    if (!this.length) return;
    const samples = this.chunk.slice(0, this.length);
    this.port.postMessage({ type: 'chunk', samples, frame: this.firstFrame }, [samples.buffer]);
    this.length = 0;
  }

  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    if (!this.recording) return true;
    // A missing input block is silence on the capture timeline, never a time cut.
    const length = input?.length ?? outputs[0]?.[0]?.length ?? 0;
    for (let i = 0; i < length; i++) {
      const frame = currentFrame + i;
      if (frame < this.startFrame) continue;
      if (!this.length) this.firstFrame = frame;
      this.chunk[this.length++] = input ? input[i] : 0;
      if (this.length === this.chunk.length) this.flush();
    }
    return true;
  }
}

registerProcessor('rgodbeat-pcm-recorder', StudioPCMRecorder);

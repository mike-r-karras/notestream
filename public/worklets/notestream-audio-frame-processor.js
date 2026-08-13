class NotestreamAudioFrameProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions || {};
    this.windowSize = config.windowSize || 4096;
    this.hopSize = config.hopSize || 512;
    this.ring = new Float32Array(this.windowSize);
    this.writeIndex = 0;
    this.samplesSinceFrame = 0;
    this.totalSamples = 0;
    this.previousInput = 0;
    this.previousOutput = 0;
    this.recycled = [];
    this.port.onmessage = event => {
      if (event.data?.type === 'recycle' && event.data.buffer) {
        this.recycled.push(event.data.buffer);
      }
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let index = 0; index < input.length; index += 1) {
      const sample = input[index];
      const filtered = sample - this.previousInput + 0.995 * this.previousOutput;
      this.previousInput = sample;
      this.previousOutput = filtered;
      this.ring[this.writeIndex] = filtered;
      this.writeIndex = (this.writeIndex + 1) % this.windowSize;
      this.samplesSinceFrame += 1;
      this.totalSamples += 1;
      if (this.totalSamples >= this.windowSize && this.samplesSinceFrame >= this.hopSize) {
        this.samplesSinceFrame = 0;
        const buffer = this.recycled.pop() || new ArrayBuffer(this.windowSize * 4);
        const frame = new Float32Array(buffer);
        for (let frameIndex = 0; frameIndex < this.windowSize; frameIndex += 1) {
          frame[frameIndex] = this.ring[(this.writeIndex + frameIndex) % this.windowSize];
        }
        this.port.postMessage({ type: 'frame', buffer }, [buffer]);
      }
    }
    return true;
  }
}

registerProcessor('notestream-audio-frame-processor', NotestreamAudioFrameProcessor);

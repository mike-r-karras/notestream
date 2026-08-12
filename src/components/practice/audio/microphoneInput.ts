import {
  DEFAULT_PRACTICE_DETECTION_CONFIG,
  type PracticeDetectionConfig,
} from './detectionConfig';

const workletLoads = new WeakMap<AudioContext, Promise<void>>();

function ensureWorkletLoaded(context: AudioContext): Promise<void> {
  const existing = workletLoads.get(context);
  if (existing) return existing;
  const loading = context.audioWorklet.addModule('/worklets/notestream-audio-frame-processor.js');
  workletLoads.set(context, loading);
  return loading;
}

export class MicrophoneInput {
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private silentGain?: GainNode;

  constructor(
    private readonly context: AudioContext,
    private readonly onFrame: (frame: Float32Array, recycle: () => void) => void,
    private readonly config: Partial<PracticeDetectionConfig> = {}
  ) {}

  async start(): Promise<void> {
    if (this.stream) return;
    const merged = { ...DEFAULT_PRACTICE_DETECTION_CONFIG, ...this.config };
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    await ensureWorkletLoaded(this.context);
    this.source = this.context.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.context, 'notestream-audio-frame-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        windowSize: merged.windowSize,
        hopSize: merged.hopSize,
      },
    });
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;
    this.worklet.port.onmessage = event => {
      if (event.data?.type !== 'frame' || !(event.data.buffer instanceof ArrayBuffer)) return;
      const buffer = event.data.buffer as ArrayBuffer;
      this.onFrame(new Float32Array(buffer), () => {
        this.worklet?.port.postMessage({ type: 'recycle', buffer }, [buffer]);
      });
    };
    this.source.connect(this.worklet);
    this.worklet.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);
    await this.context.resume();
  }

  stop(): void {
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    this.worklet = undefined;
    this.source = undefined;
    this.silentGain = undefined;
    this.stream = undefined;
  }
}

import type { ExpectedNoteEvent, PracticeDetectionResult } from '../detection/practiceDetectionTypes';
import { ScoreAudioMatcher } from '../detection/scoreAudioMatcher';
import {
  DEFAULT_PRACTICE_DETECTION_CONFIG,
  type PracticeDetectionConfig,
} from './detectionConfig';
import { MicrophoneInput } from './microphoneInput';
import { HarmonicNoteDetector } from './noteDetector';

export type PracticeAudioDebugSnapshot = {
  results: PracticeDetectionResult[];
  noiseFloor: number;
  rms: number;
};

export class PracticeAudioDetector {
  private readonly config: PracticeDetectionConfig;
  private readonly detector: HarmonicNoteDetector;
  private readonly matcher: ScoreAudioMatcher;
  private readonly microphone: MicrophoneInput;
  private candidateKey = '';
  private lastPublishedAt = 0;

  constructor(
    context: AudioContext,
    expectedEvents: ExpectedNoteEvent[],
    private readonly getPositionMs: () => number,
    private readonly onResult: (snapshot: PracticeAudioDebugSnapshot) => void,
    config: Partial<PracticeDetectionConfig> = {}
  ) {
    this.config = { ...DEFAULT_PRACTICE_DETECTION_CONFIG, ...config };
    this.detector = new HarmonicNoteDetector(context.sampleRate, this.config);
    this.matcher = new ScoreAudioMatcher(this.config);
    this.matcher.setExpectedEvents(expectedEvents);
    this.microphone = new MicrophoneInput(context, (frame, recycle) => {
      try {
        this.processFrame(frame);
      } finally {
        recycle();
      }
    }, this.config);
  }

  start(): Promise<void> {
    return this.microphone.start();
  }

  setExpectedEvents(events: ExpectedNoteEvent[]): void {
    this.matcher.setExpectedEvents(events);
    this.candidateKey = '';
  }

  stop(): void {
    this.microphone.stop();
  }

  private processFrame(frame: Float32Array): void {
    const positionMs = this.getPositionMs();
    const candidates = this.matcher.candidateMidis(positionMs);
    const key = candidates.map(candidate => `${candidate.id}:${candidate.midi}`).join('|');
    if (key !== this.candidateKey) {
      this.candidateKey = key;
      this.detector.setCandidates(candidates);
    }
    const analysis = this.detector.analyze(frame);
    const timestamp = performance.now();
    const results = this.matcher.update(
      positionMs,
      timestamp,
      analysis.notes,
      analysis.noiseFloor
    );
    if (timestamp - this.lastPublishedAt >= this.config.resultIntervalMs) {
      this.lastPublishedAt = timestamp;
      this.onResult({ results, noiseFloor: analysis.noiseFloor, rms: analysis.rms });
    }
  }
}

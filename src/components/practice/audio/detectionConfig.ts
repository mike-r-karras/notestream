export type PracticeDetectionConfig = {
  windowSize: number;
  hopSize: number;
  frequencyToleranceCents: number;
  frequencyProbeCents: number[];
  harmonicWeights: number[];
  noiseFloorMultiplier: number;
  attackThreshold: number;
  releaseThreshold: number;
  attackFrames: number;
  releaseFrames: number;
  noiseFloorAlpha: number;
  smoothingAlpha: number;
  minimumSignalRms: number;
  toleranceBeatRatio: number;
  minimumTimingToleranceMs: number;
  maximumTimingToleranceMs: number;
  chordCollectionMs: number;
  candidateLookBehindBeats: number;
  candidateLookAheadBeats: number;
  includeSemitoneMistakes: boolean;
  includeOctaveMistakes: boolean;
  resultIntervalMs: number;
};

export const DEFAULT_PRACTICE_DETECTION_CONFIG: PracticeDetectionConfig = {
  windowSize: 4096,
  hopSize: 512,
  frequencyToleranceCents: 20,
  frequencyProbeCents: [-20, 0, 20],
  harmonicWeights: [1, 0.5, 0.3, 0.2],
  noiseFloorMultiplier: 2.5,
  attackThreshold: 0.7,
  releaseThreshold: 0.4,
  attackFrames: 2,
  releaseFrames: 3,
  noiseFloorAlpha: 0.04,
  smoothingAlpha: 0.35,
  minimumSignalRms: 0.001,
  toleranceBeatRatio: 0.12,
  minimumTimingToleranceMs: 50,
  maximumTimingToleranceMs: 180,
  chordCollectionMs: 120,
  candidateLookBehindBeats: 0.25,
  candidateLookAheadBeats: 0.25,
  includeSemitoneMistakes: true,
  includeOctaveMistakes: true,
  resultIntervalMs: 50,
};

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

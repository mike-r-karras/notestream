import {
  DEFAULT_PRACTICE_DETECTION_CONFIG,
  type PracticeDetectionConfig,
} from '../audio/detectionConfig';

export function timingToleranceMs(
  beatDurationMs: number,
  config: Partial<PracticeDetectionConfig> = {}
): number {
  const merged = { ...DEFAULT_PRACTICE_DETECTION_CONFIG, ...config };
  return Math.max(
    merged.minimumTimingToleranceMs,
    Math.min(merged.maximumTimingToleranceMs, beatDurationMs * merged.toleranceBeatRatio)
  );
}

export function classifyTiming(errorMs: number, toleranceMs: number): 'correct' | 'early' | 'late' {
  if (errorMs < -toleranceMs) return 'early';
  if (errorMs > toleranceMs) return 'late';
  return 'correct';
}

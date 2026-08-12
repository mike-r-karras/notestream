import {
  DEFAULT_PRACTICE_DETECTION_CONFIG,
  midiToFrequency,
  type PracticeDetectionConfig,
} from './detectionConfig';
import { createGoertzelProbe, createHannWindow, goertzelPower, type GoertzelProbe } from './goertzel';

export type NoteCandidate = {
  id: string;
  midi: number;
  expected: boolean;
};

export type NoteConfidence = NoteCandidate & {
  frequency: number;
  confidence: number;
  rawScore: number;
  detected: boolean;
  onset: boolean;
};

type CandidateState = {
  candidate: NoteCandidate;
  probes: GoertzelProbe[][];
  smoothed: number;
  aboveFrames: number;
  belowFrames: number;
  active: boolean;
};

export class HarmonicNoteDetector {
  private readonly config: PracticeDetectionConfig;
  private readonly hann: Float32Array;
  private readonly windowed: Float32Array;
  private states: CandidateState[] = [];
  private noiseFloor = 1e-8;

  constructor(
    readonly sampleRate: number,
    config: Partial<PracticeDetectionConfig> = {}
  ) {
    this.config = { ...DEFAULT_PRACTICE_DETECTION_CONFIG, ...config };
    this.hann = createHannWindow(this.config.windowSize);
    this.windowed = new Float32Array(this.config.windowSize);
  }

  setCandidates(candidates: NoteCandidate[]): void {
    const previous = new Map(this.states.map(state => [state.candidate.id, state]));
    this.states = candidates.map(candidate => {
      const existing = previous.get(candidate.id);
      const fundamental = midiToFrequency(candidate.midi);
      const probes = this.config.harmonicWeights.map((_, harmonicIndex) =>
        this.config.frequencyProbeCents
          .filter(cents => Math.abs(cents) <= this.config.frequencyToleranceCents)
          .map(cents => createGoertzelProbe(
            fundamental * (harmonicIndex + 1) * 2 ** (cents / 1200),
            this.sampleRate
          ))
          .filter(probe => probe.frequency < this.sampleRate / 2)
      );
      return {
        candidate,
        probes,
        smoothed: existing?.smoothed ?? 0,
        aboveFrames: existing?.aboveFrames ?? 0,
        belowFrames: existing?.belowFrames ?? 0,
        active: existing?.active ?? false,
      };
    });
  }

  analyze(frame: Float32Array): { notes: NoteConfidence[]; noiseFloor: number; rms: number } {
    if (frame.length !== this.config.windowSize) {
      throw new Error(`Expected ${this.config.windowSize} samples, received ${frame.length}`);
    }
    let sumSquares = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const value = frame[index] * this.hann[index];
      this.windowed[index] = value;
      sumSquares += value * value;
    }
    const rms = Math.sqrt(sumSquares / frame.length);
    const scores = this.states.map(state => state.probes.reduce(
      (sum, harmonicProbes, harmonicIndex) => {
        let strongest = 0;
        for (const probe of harmonicProbes) {
          strongest = Math.max(strongest, goertzelPower(this.windowed, probe));
        }
        return sum + strongest * this.config.harmonicWeights[harmonicIndex];
      },
      0
    ));
    const quietEstimate = scores.length > 1 ? Math.min(...scores) : rms * rms * 0.001;
    if (rms < this.config.minimumSignalRms * 4 || quietEstimate < this.noiseFloor * 4) {
      this.noiseFloor = this.noiseFloor * (1 - this.config.noiseFloorAlpha) +
        Math.max(1e-10, quietEstimate) * this.config.noiseFloorAlpha;
    }

    const notes = this.states.map((state, index): NoteConfidence => {
      const rawScore = scores[index];
      const floor = Math.max(
        1e-10,
        this.noiseFloor * this.config.noiseFloorMultiplier,
        rms * rms * 0.002
      );
      const normalized = rms < this.config.minimumSignalRms
        ? 0
        : Math.max(0, Math.min(1, rawScore / (rawScore + floor)));
      const expectedLower = this.states.findIndex(other =>
        other.candidate.expected && other.candidate.midi === state.candidate.midi - 12
      );
      const contextAdjusted = !state.candidate.expected && expectedLower >= 0 &&
        scores[expectedLower] > floor
        ? normalized * 0.3
        : normalized;
      const previousActive = state.active;
      state.smoothed += (contextAdjusted - state.smoothed) * this.config.smoothingAlpha;
      if (state.smoothed >= this.config.attackThreshold) {
        state.aboveFrames += 1;
        state.belowFrames = 0;
        if (state.aboveFrames >= this.config.attackFrames) state.active = true;
      } else if (state.smoothed <= this.config.releaseThreshold) {
        state.belowFrames += 1;
        state.aboveFrames = 0;
        if (state.belowFrames >= this.config.releaseFrames) state.active = false;
      }
      return {
        ...state.candidate,
        frequency: midiToFrequency(state.candidate.midi),
        confidence: state.smoothed,
        rawScore,
        detected: state.active,
        onset: !previousActive && state.active,
      };
    });
    return { notes, noiseFloor: this.noiseFloor, rms };
  }
}

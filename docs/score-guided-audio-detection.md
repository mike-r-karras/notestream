# Score-guided audio detection

Notestream's first microphone detector answers a constrained question: whether
the pitches expected near the current transport position are present. It is not
an autonomous score follower or a general-purpose transcription system.

## Data flow

1. `playbackModel.ts` remains the authoritative written/playback timeline.
   Its tie-collapsed `tones` provide MIDI pitches, stable IDs, onset ticks, and
   duration ticks.
2. `scoreExpectedEvents.ts` converts those ticks to milliseconds with the
   existing beat-unit-aware transport conversion and groups simultaneous
   pitches into chord events.
3. `MicrophoneInput` requests one unprocessed mono channel and loads
   `public/worklets/notestream-audio-frame-processor.js`.
4. The AudioWorklet removes DC, maintains an overlapping ring buffer, and sends
   4096-sample frames every 512 samples. Transferred frame buffers are recycled.
5. `HarmonicNoteDetector` applies a Hann window and a precomputed Goertzel bank
   only for expected pitches and nearby likely mistakes. It combines the first
   four harmonics, probes a cents neighborhood, normalizes against frame energy
   and a quiet noise estimate, then applies attack/release hysteresis.
6. `ScoreAudioMatcher` accumulates each chord pitch independently over a short
   collection window, evaluates tempo-relative timing, and reports structured
   confidence, missing pitches, and nearby unexpected pitches.
7. `PracticeAudioDetector` publishes summaries at a controlled interval to the
   practice debug panel. Raw audio frames never enter React state.

The practice cursor still controls progress. Detection can inform future
scoring or cursor correction, but does not currently advance the score.

## Tuning

All initial values live in `audio/detectionConfig.ts`:

- window: 4096 samples; hop: 512 samples
- tuning probes: -20, 0, and +20 cents
- harmonics: 1.0, 0.5, 0.3, and 0.2
- attack/release: 0.70 for 2 frames / 0.40 for 3 frames
- timing tolerance: 12% of a beat, clamped to 50–180 ms
- chord collection: 120 ms
- candidates: expected notes plus semitone and octave neighbors
- UI publication: at most once every 50 ms

These defaults are intentionally instrument-neutral. Later instrument profiles
can override the same configuration without changing the detector pipeline.

## Browser behavior

Microphone detection is opt-in through **Mic detect**. Browsers require a secure
context (`https://` or localhost) and user permission. Echo cancellation, noise
suppression, and automatic gain control are requested off because they can
distort pitched-instrument energy, though a device/browser may ignore those
constraints.

The current JavaScript detector runs on summarized worklet frames. If profiling
shows main-thread contention, its stable frame/candidate interface is the seam
for moving Goertzel analysis into the worklet or WebAssembly.

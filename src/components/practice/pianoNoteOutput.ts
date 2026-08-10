export interface NoteOutput {
  playNote(midiNote: number, startTime: number, durationSeconds: number): void;
  allNotesOff(): void;
}

type ActiveVoice = {
  oscillators: OscillatorNode[];
  gain: GainNode;
};

export class PianoNoteOutput implements NoteOutput {
  private readonly voices = new Set<ActiveVoice>();

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode = context.destination
  ) {}

  playNote(midiNote: number, startTime: number, durationSeconds: number): void {
    const start = Math.max(this.context.currentTime, startTime);
    const duration = Math.max(0.04, durationSeconds);
    const release = Math.min(0.45, Math.max(0.12, duration * 0.3));
    const stop = start + duration + release;
    const frequency = 440 * 2 ** ((midiNote - 69) / 12);
    const gain = this.context.createGain();
    const fundamental = this.context.createOscillator();
    const harmonic = this.context.createOscillator();
    const harmonicGain = this.context.createGain();
    const voice: ActiveVoice = {
      oscillators: [fundamental, harmonic],
      gain,
    };

    fundamental.type = 'triangle';
    fundamental.frequency.setValueAtTime(frequency, start);
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(frequency * 2, start);
    harmonicGain.gain.setValueAtTime(0.18, start);

    fundamental.connect(gain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(gain);
    gain.connect(this.output);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.1, start + Math.min(0.18, duration));
    gain.gain.setValueAtTime(0.1, start + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);

    this.voices.add(voice);
    fundamental.start(start);
    harmonic.start(start);
    fundamental.stop(stop);
    harmonic.stop(stop);
    fundamental.addEventListener('ended', () => {
      this.voices.delete(voice);
      fundamental.disconnect();
      harmonic.disconnect();
      harmonicGain.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  allNotesOff(): void {
    const now = this.context.currentTime;
    this.voices.forEach(voice => {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, 0.015);
      voice.oscillators.forEach(oscillator => {
        try {
          oscillator.stop(now + 0.08);
        } catch {
          // A voice that has already stopped needs no further cleanup.
        }
      });
    });
    this.voices.clear();
  }
}

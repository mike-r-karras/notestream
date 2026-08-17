import { describe, expect, it } from 'vitest';

import { getInstrumentConfig } from './registry';

describe('instrument registry', () => {
  it('resolves ukulele aliases and exposes chord playback tones', () => {
    const config = getInstrumentConfig('Ukulele');

    expect(config?.tuning).toEqual(['G4', 'C4', 'E4', 'A4']);
    expect(config?.chords.C7).toEqual([0, 0, 0, 1]);
    expect(config?.chordTones?.C7).toEqual(['G4', 'C4', 'E4', 'A#4']);
    expect(getInstrumentConfig('uke')).toBe(config);
  });

  it('uses the first recognized instrument candidate', () => {
    expect(getInstrumentConfig('unknown', 'ukulele')?.name).toBe('ukulele');
    expect(getInstrumentConfig('piano')).toBeNull();
  });
});


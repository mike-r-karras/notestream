import { describe, expect, it } from 'vitest';
import { notationEventId } from './timeline';
import type { StandardNotationEvent, StandardNotationVoice } from './types';

describe('notationEventId', () => {
  it('scopes converter event IDs to their measure', () => {
    const voice = { staff: 1, number: 1 } as StandardNotationVoice;
    const event = { id: 'event-1' } as StandardNotationEvent;

    expect(notationEventId('measure-1', voice, event)).toBe('measure-1::event-1');
    expect(notationEventId('measure-2', voice, event)).toBe('measure-2::event-1');
  });
});

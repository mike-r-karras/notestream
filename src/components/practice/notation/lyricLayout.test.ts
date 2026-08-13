import { describe, expect, it } from 'vitest';
import { layoutLyrics, type LyricAnchor } from './lyricLayout';

const anchors: LyricAnchor[] = [
  { eventId: 'one', x: 100, eventEndX: 130, lyrics: [{ number: '1', text: 'Christ', syllabic: 'begin' }, { number: '2', text: 'O', syllabic: 'single' }] },
  { eventId: 'two', x: 160, eventEndX: 190, lyrics: [{ number: '1', text: 'mas', syllabic: 'end' }, { number: '2', text: 'green', syllabic: 'single', extend: { type: 'start' } }] },
  { eventId: 'three', x: 240, eventEndX: 280, lyrics: [{ number: '2', text: '', extend: true }] },
];

describe('lyric layout', () => {
  it('centers syllables on note anchors and assigns verse rows', () => {
    const lyrics = layoutLyrics(anchors, 100, 20);
    expect(lyrics.find(item => item.text === 'Christ')).toMatchObject({ x: 100, y: 100, verse: '1' });
    expect(lyrics.find(item => item.text === 'O')).toMatchObject({ x: 100, y: 120, verse: '2' });
  });

  it('centers a hyphen between begin and end syllables', () => {
    expect(layoutLyrics(anchors, 100).find(item => item.text === 'Christ')?.hyphenX).toBe(130);
  });

  it('draws extensions toward the next lyric anchor', () => {
    expect(layoutLyrics(anchors, 100).find(item => item.text === 'green')?.extension)
      .toEqual({ startX: 168, endX: 236 });
  });
});

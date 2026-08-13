import type { StandardNotationEvent } from './types';

export type LyricAnchor = {
  eventId: string;
  x: number;
  eventEndX: number;
  lyrics: NonNullable<StandardNotationEvent['lyrics']>;
};

export type PositionedLyric = {
  eventId: string;
  verse: string;
  text: string;
  syllabic: string;
  x: number;
  y: number;
  hyphenX?: number;
  extension?: { startX: number; endX: number };
};

function hasExtension(extend: NonNullable<StandardNotationEvent['lyrics']>[number]['extend']): boolean {
  if (!extend) return false;
  if (typeof extend === 'string') return extend.toLowerCase() !== 'stop';
  if (typeof extend === 'object') return extend.type?.toLowerCase() !== 'stop';
  return true;
}

export function layoutLyrics(
  anchors: LyricAnchor[],
  rowTop: number,
  rowHeight = 18
): PositionedLyric[] {
  const verses = [...new Set(anchors.flatMap(anchor =>
    anchor.lyrics.map(lyric => String(lyric.number ?? '1'))
  ))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const verseRow = new Map(verses.map((verse, index) => [verse, rowTop + index * rowHeight]));
  const positioned = anchors.flatMap(anchor => anchor.lyrics
    .filter(lyric => !!lyric.text || hasExtension(lyric.extend))
    .map(lyric => ({
      anchor,
      lyric,
      verse: String(lyric.number ?? '1'),
    }))
  );

  return positioned.map((item, index) => {
    const next = positioned.slice(index + 1).find(candidate => candidate.verse === item.verse);
    const syllabic = item.lyric.syllabic ?? 'single';
    const shouldHyphenate = syllabic === 'begin' || syllabic === 'middle';
    const extensionEnd = next?.anchor.x ?? item.anchor.eventEndX;
    return {
      eventId: item.anchor.eventId,
      verse: item.verse,
      text: item.lyric.text ?? '',
      syllabic,
      x: item.anchor.x,
      y: verseRow.get(item.verse) ?? rowTop,
      hyphenX: shouldHyphenate && next
        ? (item.anchor.x + next.anchor.x) / 2
        : undefined,
      extension: hasExtension(item.lyric.extend) && extensionEnd > item.anchor.x + 8
        ? { startX: item.anchor.x + 8, endX: extensionEnd - 4 }
        : undefined,
    };
  });
}

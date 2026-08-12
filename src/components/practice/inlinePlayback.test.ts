import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EasyScoreDocument } from '../../types/easyScore';
import { buildInlinePlaybackDocument } from './inlinePlayback';
import { buildNotationPlaybackModel } from './playbackModel';
import { buildNotationTimeline, getNotationMeasures } from './notation/timeline';
import { resolvePlaybackSequence } from './playbackResolver';

describe('buildInlinePlaybackDocument', () => {
  it('expands Fur Elise without repeating the pickup or mutating the source', () => {
    const source = JSON.parse(
      readFileSync(
        new URL('../../../test/fixtures/scores/fur-elise-beethoven-for-beginner-piano.ezs', import.meta.url),
        'utf8'
      )
    ) as EasyScoreDocument;
    const sourceMeasures = getNotationMeasures(source);
    const sourceSnapshot = JSON.stringify(source);
    const sequence = resolvePlaybackSequence(source);
    const inline = buildInlinePlaybackDocument(source, sequence);
    const inlineMeasures = getNotationMeasures(inline);

    expect(inlineMeasures.map(measure => measure.number)).toEqual(
      sequence.measures.map(entry => entry.writtenMeasureNumber)
    );
    expect(inlineMeasures.filter(measure => measure.number === 0)).toHaveLength(1);
    expect(inlineMeasures.filter(measure => measure.number === 1)).toHaveLength(2);
    expect(new Set(inlineMeasures.map(measure => measure.id)).size).toBe(inlineMeasures.length);
    expect(
      new Set(inlineMeasures.flatMap(measure =>
        (measure.voices ?? []).flatMap(voice =>
          (voice.events ?? []).map(event => event.id)
        )
      )).size
    ).toBe(
      inlineMeasures.reduce(
        (count, measure) => count + (measure.voices ?? []).reduce(
          (voiceCount, voice) => voiceCount + (voice.events ?? []).length,
          0
        ),
        0
      )
    );
    expect(inlineMeasures.find(measure => measure.number === 8)?.playbackPresentation)
      .toMatchObject({ repeatPass: 1, ghostRepeatSigns: true });
    const model = buildNotationPlaybackModel(inline);
    const renderedEventIds = new Set(
      buildNotationTimeline(inline).flatMap(segment =>
        segment.events
          .filter(event => event.kind === 'note')
          .map(event => event.id)
      )
    );
    expect(model.notes.every(note => renderedEventIds.has(note.id))).toBe(true);
    expect(
      new Set(
        model.notes
          .filter(note => note.id.startsWith('P1-m1-'))
          .map(note => note.id)
      ).size
    ).toBeGreaterThan(1);
    expect(JSON.stringify(source)).toBe(sourceSnapshot);
    expect(getNotationMeasures(source)).toBe(sourceMeasures);
  });

  it('returns the canonical document when no repeats need expansion', () => {
    const document = {
      schemaVersion: '1.2',
      metadata: { sheetType: 'standard-notation' },
      parts: [{ id: 'P1', measures: [] }],
    } as unknown as EasyScoreDocument;

    expect(
      buildInlinePlaybackDocument(document, { measures: [], hasRepeats: false })
    ).toBe(document);
  });
});

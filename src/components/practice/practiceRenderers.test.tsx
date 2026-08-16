import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { EasyScoreDocument } from '../../types/easyScore';
import { positionSegments } from '../../utils/practiceTimeline';
import { chordLyricsPracticeRenderer } from './practiceRenderers';

describe('chord lyrics renderer', () => {
  it('renders chords and lyric cues at their shared beat columns', () => {
    const document: EasyScoreDocument = {
      schemaVersion: 'chord-chart-1.0',
      metadata: { sheetType: 'chord-lyrics', timeSignature: [4, 4] },
      sections: [{
        id: 'verse',
        label: 'Verse 1',
        measures: [{
          id: 'm9',
          number: 9,
          beats: 4,
          effectiveChord: 'A',
          chords: [{ id: 'c1', beat: { numerator: 0, denominator: 1 }, symbol: 'A' }],
          lyricCues: [
            { id: 'l1', beat: { numerator: 0, denominator: 1 }, text: 'night' },
            { id: 'l2', beat: { numerator: 3, denominator: 1 }, text: 'has' },
          ],
        }],
      }],
    };
    const segments = positionSegments(chordLyricsPracticeRenderer.buildTimeline(document), 0);
    const markup = renderToStaticMarkup(chordLyricsPracticeRenderer.renderSegment(segments[0], {
      isPlaying: false,
      beatCount: 0,
      currentTick: 0,
      offsetX: 0,
      segments,
    }));

    expect(markup).toContain('>A</span>');
    expect(markup).toContain('data-beat="0"');
    expect(markup).toContain('data-beat="3"');
    expect(markup).toContain('>night</span>');
    expect(markup).toContain('>has</span>');
    expect(markup).not.toContain('legacy lyric');
    expect(markup).toContain('top-2 left-3');
    expect(markup).toContain(`x1="${segments[0].width - 0.5}"`);
    expect(markup).toContain('top:2px');
  });

  it('renders later chord changes as full chord diagrams', () => {
    const document: EasyScoreDocument = {
      metadata: { sheetType: 'chord-lyrics', timeSignature: [4, 4] },
      sections: [{
        id: 'intro',
        label: 'Intro',
        measures: [{
          id: 'm4',
          number: 4,
          beats: 4,
          effectiveChord: 'C',
          chords: [
            { id: 'c1', beat: 0, symbol: 'C', printed: true },
            { id: 'c2', beat: 1, symbol: 'C', printed: true },
            { id: 'c3', beat: 2, symbol: 'G', printed: true },
          ],
        }],
      }],
    };
    const segments = positionSegments(chordLyricsPracticeRenderer.buildTimeline(document), 0);
    const markup = renderToStaticMarkup(chordLyricsPracticeRenderer.renderSegment(segments[0], {
      isPlaying: false,
      beatCount: 0,
      currentTick: 0,
      offsetX: 0,
      segments,
    }));

    expect(markup.match(/chord-diagram-container/g)).toHaveLength(3);
    expect(markup).toContain('data-chord-id="c2"');
    expect(markup).toContain('data-chord-id="c3"');
    expect(markup).toContain('text-[15px] font-extrabold text-indigo-300');
    expect(markup).not.toContain('uppercase tracking-widest');
    expect(segments[0].width).toBe(325.5);
  });
});

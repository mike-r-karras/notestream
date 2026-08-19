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

  it('keeps a printed opening chord when no sticky chord box is present', () => {
    const document: EasyScoreDocument = {
      metadata: { sheetType: 'chord-lyrics', timeSignature: [4, 4] },
      sections: [{
        id: 'verse', label: 'Verse', measures: [{
          id: 'm1', number: 1, beats: 4, effectiveChord: 'Am7',
          chords: [{ id: 'c1', beat: 0, symbol: 'Am7', printed: true }],
        }, {
          id: 'm2', number: 2, beats: 4, effectiveChord: 'Am7',
          chords: [{ id: 'c2', beat: 0, symbol: 'Am7', printed: true }],
        }],
      }],
    };
    const segments = positionSegments(chordLyricsPracticeRenderer.buildTimeline(document), 0);
    const markup = renderToStaticMarkup(chordLyricsPracticeRenderer.renderSegment(segments[1], {
      isPlaying: false,
      beatCount: 0,
      currentTick: 0,
      offsetX: 0,
      segments,
    }));

    expect(markup).toContain('data-chord-id="c2"');
    expect(markup).toContain('data-chord="Am7"');
  });

  it('renders individual chord-tone feedback on its stable beat', () => {
    const document: EasyScoreDocument = {
      metadata: { sheetType: 'chord-lyrics', timeSignature: [4, 4] },
      sections: [{
        id: 'verse', label: 'Verse', measures: [{
          id: 'm1', number: 1, beats: 4, effectiveChord: 'C',
          chords: [{ id: 'c1', beat: 0, symbol: 'C' }],
        }],
      }],
    };
    const segments = positionSegments(chordLyricsPracticeRenderer.buildTimeline(document), 0);
    const feedbackByBeatId = new Map([['m1-beat-0', [
      { id: 'm1-beat-0-C-tone-0', midi: 60, frequency: 261.6, confidence: 1, detected: true, status: 'correct' as const },
      { id: 'm1-beat-0-C-tone-1', midi: 64, frequency: 329.6, confidence: 0, detected: false, status: 'missing' as const },
    ]]]);
    const markup = renderToStaticMarkup(chordLyricsPracticeRenderer.renderSegment(segments[0], {
      isPlaying: true,
      beatCount: 1,
      currentTick: 0,
      offsetX: 0,
      segments,
      feedbackByBeatId,
    }));

    expect(markup).toContain('data-feedback-beat="m1-beat-0"');
    expect(markup).toContain('var(--theme-feedback-missed)');
    expect(markup).toContain('>C4</tspan>');
    expect(markup).toContain('> E4</tspan>');
  });
});

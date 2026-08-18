import { describe, expect, it } from 'vitest';
import {
  registerRenderedNote,
  setRenderedNoteActive,
  setRenderedNoteFeedback,
  type RenderedNoteRegistry,
} from './renderedNoteRegistry';

function fakeSvgElement() {
  const classes = new Set<string>();
  return {
    classes,
    element: {
      classList: {
        add(name: string) {
          classes.add(name);
        },
        remove(name: string) {
          classes.delete(name);
        },
        toggle(name: string, active: boolean) {
          if (active) classes.add(name);
          else classes.delete(name);
        },
      },
    } as SVGElement,
  };
}

describe('rendered note registry', () => {
  it('does not discard a rendered element if an identity is registered twice', () => {
    const registry: RenderedNoteRegistry = new Map();
    const first = fakeSvgElement();
    const second = fakeSvgElement();

    registerRenderedNote(registry, 'shared-event-id', first.element);
    registerRenderedNote(registry, 'shared-event-id', second.element);
    setRenderedNoteActive(registry, 'shared-event-id', true);

    expect(registry.get('shared-event-id')?.size).toBe(2);
    expect(first.classes.has('notestream-playback-active')).toBe(true);
    expect(second.classes.has('notestream-playback-active')).toBe(true);

    setRenderedNoteActive(registry, 'shared-event-id', false);
    expect(first.classes.has('notestream-playback-active')).toBe(false);
    expect(second.classes.has('notestream-playback-active')).toBe(false);
  });

  it('replaces persistent musical feedback without disturbing playback state', () => {
    const registry: RenderedNoteRegistry = new Map();
    const note = fakeSvgElement();
    registerRenderedNote(registry, 'note', note.element);
    setRenderedNoteActive(registry, 'note', true);

    setRenderedNoteFeedback(registry, 'note', 'timing');
    expect(note.classes).toContain('notestream-playback-active');
    expect(note.classes).toContain('notestream-feedback-timing');

    setRenderedNoteFeedback(registry, 'note', 'correct');
    expect(note.classes).not.toContain('notestream-feedback-timing');
    expect(note.classes).toContain('notestream-feedback-correct');

    setRenderedNoteFeedback(registry, 'note', null);
    expect(note.classes).toEqual(new Set(['notestream-playback-active']));
  });
});

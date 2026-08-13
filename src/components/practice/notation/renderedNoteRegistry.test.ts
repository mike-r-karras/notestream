import { describe, expect, it } from 'vitest';
import {
  registerRenderedNote,
  setRenderedNoteActive,
  type RenderedNoteRegistry,
} from './renderedNoteRegistry';

function fakeSvgElement() {
  const classes = new Set<string>();
  return {
    classes,
    element: {
      classList: {
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
});

export type RenderedNoteRegistry = Map<string, Set<SVGElement>>;

export function registerRenderedNote(
  registry: RenderedNoteRegistry,
  id: string,
  element: SVGElement
): void {
  const elements = registry.get(id);
  if (elements) {
    elements.add(element);
    return;
  }
  registry.set(id, new Set([element]));
}

export function setRenderedNoteActive(
  registry: RenderedNoteRegistry,
  id: string,
  active: boolean
): void {
  registry.get(id)?.forEach(element => {
    element.classList.toggle('notestream-playback-active', active);
  });
}

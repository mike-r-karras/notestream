export type RenderedNoteRegistry = Map<string, Set<SVGElement>>;
export type RenderedNoteFeedback = 'correct' | 'timing' | 'missed' | 'incorrect';

const FEEDBACK_CLASSES: Record<RenderedNoteFeedback, string> = {
  correct: 'notestream-feedback-correct',
  timing: 'notestream-feedback-timing',
  missed: 'notestream-feedback-missed',
  incorrect: 'notestream-feedback-incorrect',
};

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

export function setRenderedNoteFeedback(
  registry: RenderedNoteRegistry,
  id: string,
  feedback: RenderedNoteFeedback | null
): void {
  registry.get(id)?.forEach(element => {
    Object.values(FEEDBACK_CLASSES).forEach(className => {
      element.classList.remove(className);
    });
    if (feedback) element.classList.add(FEEDBACK_CLASSES[feedback]);
  });
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

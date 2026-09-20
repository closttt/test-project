import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";

/**
 * Russian screen-reader text for dnd-kit. Its defaults are English («Draggable item … was moved
 * over …»), which would be the only English a screen-reader user hears in the whole app.
 * `label(id)` turns a raw id into something a person recognises (a task title, a column name).
 */
export function dndAnnouncements(label: (id: string) => string): Announcements {
  return {
    onDragStart: ({ active }) => `Взяли «${label(String(active.id))}».`,
    onDragOver: ({ active, over }) =>
      over ? `«${label(String(active.id))}» над «${label(String(over.id))}».` : `«${label(String(active.id))}» вне зоны сброса.`,
    onDragEnd: ({ active, over }) =>
      over ? `«${label(String(active.id))}» перемещено к «${label(String(over.id))}».` : `«${label(String(active.id))}» возвращено на место.`,
    onDragCancel: ({ active }) => `Перетаскивание «${label(String(active.id))}» отменено.`,
  };
}

export const DND_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable: "Чтобы перетащить, нажмите и удерживайте (на тач-экране — долгое нажатие), затем переместите и отпустите.",
};

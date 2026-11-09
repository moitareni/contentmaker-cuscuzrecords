import type { ImageEl, SlideData } from '../types';

export function collectAllImageIds(slides: SlideData[]): Set<string> {
  const ids = new Set<string>();
  for (const slide of slides) {
    for (const el of slide.doc.elements) {
      if (el.kind === 'image') {
        ids.add(el.imageId);
        if ((el as ImageEl).cutFrom?.imageId) {
          ids.add((el as ImageEl).cutFrom!.imageId);
        }
      }
    }
  }
  return ids;
}

export function reconcileAllSlides(
  slides: SlideData[],
  availableIds: Set<string>,
): SlideData[] {
  return slides.map((slide) => ({
    ...slide,
    doc: {
      ...slide.doc,
      elements: slide.doc.elements.filter(
        (el) => el.kind !== 'image' || availableIds.has(el.imageId),
      ),
    },
  }));
}

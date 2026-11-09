import { describe, expect, it } from 'vitest';
import type { El, FinishState, ImageEl, SlideData } from '../types';
import { collectAllImageIds, reconcileAllSlides } from './carouselGC';

const dummyFinish: FinishState = {
  paper: { enabled: false, opacity: 40 },
  grain: { enabled: false, intensity: 50, size: 'P' },
  borderTexture: { enabled: false, opacity: 40 },
};

const makeImageEl = (id: string, imageId: string, cutFromId?: string): ImageEl => ({
  id,
  kind: 'image',
  imageId,
  name: `img-${imageId}`,
  width: 500,
  height: 500,
  flipX: false,
  flipY: false,
  x: 100,
  y: 100,
  rotation: 0,
  scale: 1,
  ...(cutFromId
    ? { cutFrom: { imageId: cutFromId, name: `orig-${cutFromId}`, width: 500, height: 500 } }
    : {}),
});

const makeDecoEl = (id: string): El => ({
  id,
  kind: 'decoration',
  assetId: 'flores',
  flipX: false,
  flipY: false,
  x: 100,
  y: 100,
  rotation: 0,
  scale: 1,
});

const makeSlide = (id: string, elements: El[]): SlideData => ({
  id,
  doc: {
    format: '3:4',
    backgroundId: null,
    elements,
  },
  finish: dummyFinish,
});

describe('carouselGC', () => {
  describe('Propriedade 19: collectAllImageIds preserva apenas blobs referenciados', () => {
    it('retorna exatamente a união de imageId e cutFrom.imageId de todos os slides', () => {
      for (let run = 0; run < 25; run++) {
        const slideCount = (run % 10) + 1;
        const expected = new Set<string>();
        const slides: SlideData[] = [];

        for (let s = 0; s < slideCount; s++) {
          const els: El[] = [makeDecoEl(`deco-${s}`)];
          const imgCount = (run + s) % 5;
          for (let k = 0; k < imgCount; k++) {
            const imgId = `img-${run}-${s}-${k}`;
            const cutId = (k + s) % 2 === 0 ? `cut-${run}-${s}-${k}` : undefined;
            expected.add(imgId);
            if (cutId) expected.add(cutId);
            els.push(makeImageEl(`el-${s}-${k}`, imgId, cutId));
          }
          slides.push(makeSlide(`slide-${s}`, els));
        }

        const actual = collectAllImageIds(slides);
        expect(actual).toEqual(expected);
      }
    });
  });

  describe('Propriedade 18: reconcileAllSlides elimina referências órfãs', () => {
    it('remove elementos de imagem cujo imageId não está em availableIds e preserva os demais', () => {
      for (let run = 0; run < 25; run++) {
        const availableIds = new Set<string>(['keep-1', 'keep-2', `keep-dyn-${run}`]);
        const slides: SlideData[] = [
          makeSlide('s1', [
            makeDecoEl('d1'),
            makeImageEl('i1', 'keep-1'),
            makeImageEl('i2', 'orphan-1'),
          ]),
          makeSlide('s2', [
            makeImageEl('i3', `keep-dyn-${run}`, 'orphan-cut'),
            makeImageEl('i4', `orphan-dyn-${run}`),
            makeDecoEl('d2'),
          ]),
        ];

        const reconciled = reconcileAllSlides(slides, availableIds);

        for (const slide of reconciled) {
          for (const el of slide.doc.elements) {
            if (el.kind === 'image') {
              expect(availableIds.has(el.imageId)).toBe(true);
            }
          }
        }

        expect(reconciled[0].doc.elements.map((e) => e.id)).toEqual(['d1', 'i1']);
        expect(reconciled[1].doc.elements.map((e) => e.id)).toEqual(['i3', 'd2']);
      }
    });
  });
});

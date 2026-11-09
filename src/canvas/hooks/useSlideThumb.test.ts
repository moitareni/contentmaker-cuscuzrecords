import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_FORMATS, type PostFormat } from '../../brand/brand';
import { defaultSlide } from '../../store/carouselStore';
import {
  captureOrGetCachedThumb,
  clearSlideThumbCache,
  getThumbCaptureDimensions,
} from './useSlideThumb';

describe('useSlideThumb', () => {
  beforeEach(() => {
    clearSlideThumbCache();
  });

  describe('Propriedade 9: Proporção das miniaturas corresponde ao formato', () => {
    it('para qualquer formato f e displayWidth, a razão largura/altura da miniatura é igual a POST_FORMATS[f]', () => {
      const formats: PostFormat[] = ['3:4', '4:3', '1:1'];
      const widths = [240, 360, 480, 600, 720];

      for (const fmt of formats) {
        const expectedRatio = POST_FORMATS[fmt].width / POST_FORMATS[fmt].height;
        for (const dw of widths) {
          const dims = getThumbCaptureDimensions(dw, fmt);
          const actualRatio = dims.renderedWidth / dims.renderedHeight;
          expect(actualRatio).toBeCloseTo(expectedRatio, 6);
        }
      }
    });
  });

  describe('Propriedade 21: Cache de miniaturas idempotente', () => {
    it('retorna o mesmo dataUrl sem recapturar o Stage enquanto doc e finish não mudam', () => {
      const slide = defaultSlide('3:4');
      const toDataURL = vi.fn(() => 'data:image/webp;base64,thumb-mock-1');
      const mockStage = {
        toDataURL,
        x: () => 0,
        y: () => 0,
      };

      const first = captureOrGetCachedThumb(mockStage, 360, slide, '3:4');
      const second = captureOrGetCachedThumb(mockStage, 360, slide, '3:4');
      const third = captureOrGetCachedThumb(mockStage, 360, slide, '3:4');

      expect(first).toBe('data:image/webp;base64,thumb-mock-1');
      expect(second).toBe(first);
      expect(third).toBe(first);
      expect(toDataURL).toHaveBeenCalledTimes(1);

      // Modificar o doc invalida o cache e recaptura
      const modifiedSlide = {
        ...slide,
        doc: { ...slide.doc, backgroundFlipX: true },
      };
      toDataURL.mockReturnValueOnce('data:image/webp;base64,thumb-mock-2');
      const afterChange = captureOrGetCachedThumb(mockStage, 360, modifiedSlide, '3:4');
      expect(afterChange).toBe('data:image/webp;base64,thumb-mock-2');
      expect(toDataURL).toHaveBeenCalledTimes(2);
    });
  });
});

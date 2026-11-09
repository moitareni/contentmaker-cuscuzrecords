import { describe, expect, it } from 'vitest';
import { CAROUSEL_MAX_SLIDES, POST_FORMATS, type PostFormat } from '../brand/brand';
import {
  formatCarouselZipFilename,
  formatSlideFilename,
  generateSlideFilenames,
  getCarouselExportDimensions,
} from './exportCarousel';

describe('exportCarousel', () => {
  describe('Propriedade 14: Nomenclatura correta dos arquivos no ZIP', () => {
    it('gera nomes slide-01.png .. slide-NN.png com zero-padding de 2 dígitos para n em 1..CAROUSEL_MAX_SLIDES', () => {
      for (let n = 1; n <= CAROUSEL_MAX_SLIDES; n++) {
        const names = generateSlideFilenames(n);
        expect(names).toHaveLength(n);
        for (let i = 0; i < n; i++) {
          const expected = `slide-${String(i + 1).padStart(2, '0')}.png`;
          expect(names[i]).toBe(expected);
          expect(formatSlideFilename(i + 1)).toBe(expected);
          expect(names[i]).toMatch(/^slide-\d{2}\.png$/);
        }
      }
    });

    it('gera o nome do arquivo ZIP no formato cuscuz-carrossel-YYYY-MM-DD-HHmm.zip', () => {
      const fixedDate = new Date(2026, 10, 8, 15, 42); // Nov 8, 2026 15:42
      expect(formatCarouselZipFilename(fixedDate)).toBe('cuscuz-carrossel-2026-11-08-1542.zip');
    });
  });

  describe('Propriedade 15: Dimensões corretas na exportação', () => {
    it('para qualquer formato f e largura de display, produz exatamente POST_FORMATS[f].width × POST_FORMATS[f].height', () => {
      const formats: PostFormat[] = ['3:4', '4:3', '1:1'];
      const displayWidths = [270, 320, 360, 450, 540, 720];

      for (const fmt of formats) {
        const expected = POST_FORMATS[fmt];
        for (const dw of displayWidths) {
          const dims = getCarouselExportDimensions(fmt, dw);
          expect(dims.exportedWidth).toBe(expected.width);
          expect(dims.exportedHeight).toBe(expected.height);
        }
      }
    });
  });
});

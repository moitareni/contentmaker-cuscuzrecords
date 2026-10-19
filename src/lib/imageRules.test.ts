import { describe, expect, it } from 'vitest';
import { POST_H, POST_W } from '../brand/brand';
import type { El } from '../types';
import {
  clampImageCenter,
  countImages,
  downscaleDimensions,
  imageFileLabel,
  initialImageScale,
  isImageFileTooBig,
  isPersistedImage,
  isSupportedImageFile,
} from './imageRules';

const imageEl = (over: Partial<Extract<El, { kind: 'image' }>> = {}): El =>
  ({
    id: 'i1',
    kind: 'image',
    imageId: 'img-1',
    name: 'Foto',
    width: 100,
    height: 100,
    flipX: false,
    flipY: false,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    ...over,
  }) as El;

describe('isSupportedImageFile', () => {
  it('aceita raster comuns', () => {
    expect(isSupportedImageFile({ type: 'image/png' })).toBe(true);
    expect(isSupportedImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isSupportedImageFile({ type: 'image/webp' })).toBe(true);
    expect(isSupportedImageFile({ type: 'image/gif' })).toBe(true);
  });

  it('recusa SVG e tipos desconhecidos', () => {
    expect(isSupportedImageFile({ type: 'image/svg+xml' })).toBe(false);
    expect(isSupportedImageFile({ type: 'video/mp4' })).toBe(false);
    expect(isSupportedImageFile({ type: '' })).toBe(false);
  });
});

describe('isImageFileTooBig', () => {
  it('aceita arquivos até o limite e recusa acima', () => {
    const limit = 25 * 1024 * 1024;
    expect(isImageFileTooBig({ size: limit })).toBe(false);
    expect(isImageFileTooBig({ size: limit + 1 })).toBe(true);
  });
});

describe('downscaleDimensions', () => {
  it('não altera imagem menor que o limite', () => {
    expect(downscaleDimensions(1080, 1440)).toEqual({ width: 1080, height: 1440 });
  });

  it('reduz o maior lado para o limite e preserva a proporção', () => {
    const out = downscaleDimensions(6000, 4000, 3000);
    expect(out).toEqual({ width: 3000, height: 2000 });
  });

  it('reduz no sentido da altura quando ela é maior', () => {
    const out = downscaleDimensions(1080, 2000, 1500);
    expect(out).toEqual({ width: 810, height: 1500 });
  });

  it('rejeita dimensões inválidas', () => {
    expect(downscaleDimensions(0, 100)).toEqual({ width: 0, height: 0 });
    expect(downscaleDimensions(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('initialImageScale', () => {
  it('encaixa foto grande dentro de ~70% da folha', () => {
    const scale = initialImageScale(3000, 4000);
    expect(scale).toBeCloseTo((POST_W * 0.7) / 3000);
    // Altura resultado não passa de 70% do post
    expect(4000 * scale).toBeLessThanOrEqual(POST_H * 0.7 + 1e-9);
  });

  it('não amplia imagem pequena', () => {
    expect(initialImageScale(100, 80)).toBe(1);
  });

  it('dimensão inválida devolve escala neutra', () => {
    expect(initialImageScale(0, 0)).toBe(1);
  });
});

describe('clampImageCenter', () => {
  it('mantém ponto dentro da folha', () => {
    expect(clampImageCenter(540, 720)).toEqual({ x: 540, y: 720 });
  });

  it('clamp valores fora dos limites', () => {
    expect(clampImageCenter(-10, 1500)).toEqual({ x: 0, y: POST_H });
    expect(clampImageCenter(2000, 720)).toEqual({ x: POST_W, y: 720 });
  });

  it('coordenada não numérica cai no centro', () => {
    expect(clampImageCenter(Number.NaN, Number.NaN)).toEqual({ x: POST_W / 2, y: POST_H / 2 });
  });
});

describe('countImages', () => {
  it('conta só elementos de imagem', () => {
    const deco: El = {
      id: 'd1',
      kind: 'decoration',
      assetId: 'flores',
      flipX: false,
      flipY: false,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
    };
    expect(countImages([deco, imageEl(), imageEl({ id: 'i2' })])).toBe(2);
  });
});

describe('isPersistedImage', () => {
  it('exige imageId e dimensões positivas', () => {
    expect(isPersistedImage(imageEl())).toBe(true);
    expect(isPersistedImage(imageEl({ imageId: '' }))).toBe(false);
    expect(isPersistedImage(imageEl({ width: 0 }))).toBe(false);
    expect(isPersistedImage(imageEl({ height: -1 }))).toBe(false);
  });
});

describe('imageFileLabel', () => {
  it('remove extensão e normaliza separadores', () => {
    expect(imageFileLabel('minha_foto-do-parque.png')).toBe('minha foto do parque');
  });

  it('trunca nomes longos', () => {
    const label = imageFileLabel(`${'a'.repeat(60)}.jpg`);
    expect(label.length).toBe(40);
    expect(label.endsWith('…')).toBe(true);
  });

  it('usa rótulo padrão quando o nome fica vazio', () => {
    expect(imageFileLabel('.png')).toBe('Imagem');
  });
});

import { GRAIN_STDDEV } from '../brand/brand';

/** RNG com seed (mulberry32): mesmo grão no preview e no export. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dados do granulado monocromático com distribuição gaussiana
 * (cara de filme, não de ruído digital uniforme).
 * Pura e testável — ver grain.test.ts.
 *
 * @param size lado do tile em px
 * @param seed semente do RNG
 * @param stddev desvio padrão do grão em torno do cinza médio
 * @returns RGBA por pixel (r === g === b sempre)
 */
export function makeGrainData(size: number, seed: number, stddev = GRAIN_STDDEV): Uint8ClampedArray {
  const rand = mulberry32(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // Gaussiana aproximada: média de 3 uniformes (média 1.5, desvio 0.5),
    // normalizada para média 0 e desvio ~1 (cara de filme, não digital).
    const z = (rand() + rand() + rand() - 1.5) * 2;
    const v = Math.round(128 + z * stddev);
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  return data;
}

const tileCache = new Map<string, HTMLCanvasElement | null>();

/**
 * Tile de grain como canvas (vira fillPattern no Konva).
 * Cacheado por tamanho+seed. Null sem canvas 2D (ex.: SSR/teste).
 */
export function makeGrainTile(size: number, seed: number): HTMLCanvasElement | null {
  const key = `${size}:${seed}`;
  const hit = tileCache.get(key);
  if (hit !== undefined) return hit;

  if (typeof document === 'undefined') {
    tileCache.set(key, null);
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    tileCache.set(key, null);
    return null;
  }
  const img = ctx.createImageData(size, size);
  img.data.set(makeGrainData(size, seed));
  ctx.putImageData(img, 0, 0);
  tileCache.set(key, canvas);
  return canvas;
}

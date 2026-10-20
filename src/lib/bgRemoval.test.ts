import { describe, expect, it } from 'vitest';
import {
  applyCutoutData,
  boxBlurPlane,
  downsamplePlane,
  erode3x3,
  fbFusionForeground,
  fromHalfFloat,
  gammaCurve,
  gaussianBlur,
  median3x3,
  sigmoidInPlace,
  smoothstepCurve,
} from './bgRemoval';

const EPS = 1e-4;

const plane = (w: number, h: number, fill: (i: number) => number): Float32Array => {
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = fill(i);
  return a;
};

describe('sigmoidInPlace', () => {
  it('mapeia logits para [0..1]', () => {
    const x = new Float32Array([0, -2, 2, 100, -100]);
    sigmoidInPlace(x);
    expect(x[0]).toBeCloseTo(0.5, 4);
    expect(x[1]).toBeCloseTo(0.1192, 3);
    expect(x[2]).toBeCloseTo(0.8808, 3);
    expect(x[3]).toBeCloseTo(1, 4);
    expect(x[4]).toBeCloseTo(0, 4);
  });
});

describe('smoothstepCurve', () => {
  it('mantém alpha parcial entre as bordas e satura fora', () => {
    const a = new Float32Array([0.1, 0.25, 0.5, 0.75, 0.9]);
    smoothstepCurve(a, 0.25, 0.75);
    expect(a[0]).toBeCloseTo(0, 4);
    expect(a[1]).toBeCloseTo(0, 4);
    expect(a[2]).toBeCloseTo(0.5, 4);
    expect(a[3]).toBeCloseTo(1, 4);
    expect(a[4]).toBeCloseTo(1, 4);
  });

  it('é monotônica', () => {
    const a = plane(50, 1, (i) => i / 49);
    smoothstepCurve(a, 0.25, 0.75);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1]);
  });
});

describe('gammaCurve', () => {
  it('gamma < 1 puxa p/ frente e gamma > 1 endurece', () => {
    const soft = new Float32Array([0.5]);
    gammaCurve(soft, 0.85);
    expect(soft[0]).toBeCloseTo(Math.pow(0.5, 0.85), 5);
    const hard = new Float32Array([0.5]);
    gammaCurve(hard, 1.1);
    expect(hard[0]).toBeCloseTo(Math.pow(0.5, 1.1), 5);
  });
});

describe('median3x3', () => {
  it('remove ponto isolado de ruído', () => {
    const a = plane(5, 5, () => 0);
    a[2 * 5 + 2] = 1;
    const out = median3x3(a, 5, 5);
    expect(out[2 * 5 + 2]).toBe(0);
  });

  it('preserva bloco sólido no interior', () => {
    const a = plane(5, 5, () => 1);
    const out = median3x3(a, 5, 5);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(1);
  });
});

describe('erode3x3', () => {
  it('encolhe bloco 3×3 para o centro', () => {
    const a = plane(5, 5, () => 0);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) a[y * 5 + x] = 1;
    const out = erode3x3(a, 5, 5);
    expect(out[2 * 5 + 2]).toBe(1);
    expect(out[2 * 5 + 1]).toBe(0);
    expect(out[1 * 5 + 2]).toBe(0);
    expect(out[3 * 5 + 3]).toBe(0);
  });
});

describe('gaussianBlur', () => {
  it('preserva plano constante', () => {
    const a = plane(8, 8, () => 0.37);
    const out = gaussianBlur(a, 8, 8, 1.2);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(0.37, 5);
  });

  it('espalha impulso e reduz o pico', () => {
    const a = plane(9, 9, (i) => (i === 40 ? 1 : 0));
    const out = gaussianBlur(a, 9, 9, 1.2);
    expect(out[40]).toBeLessThan(1);
    let sum = 0;
    for (let i = 0; i < out.length; i++) sum += out[i];
    expect(sum).toBeGreaterThan(0.9);
    expect(sum).toBeLessThanOrEqual(1 + EPS);
  });
});

describe('boxBlurPlane', () => {
  it('preserva plano constante com raio grande', () => {
    const a = plane(16, 16, () => 0.42);
    const out = boxBlurPlane(a, 16, 16, 5);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(0.42, 5);
  });

  it('impulso vira média uniforme da janela', () => {
    const a = plane(9, 9, (i) => (i === 40 ? 25 : 0));
    const out = boxBlurPlane(a, 9, 9, 2);
    // centro: janela 5×5 pega o impulso inteiro → 25/25 = 1
    expect(out[40]).toBeCloseTo(1, 5);
    // canto distante: fora da janela → 0
    expect(out[0]).toBe(0);
  });
});

describe('fbFusionForeground', () => {
  it('devolve a própria cor em imagem uniforme, qualquer que seja o alpha', () => {
    const w = 12;
    const h = 12;
    const n = w * h;
    const rgb = plane(n * 3, 1, () => 0.5);
    const alpha = plane(n, 1, (i) => (i % 2 === 0 ? 0.3 : 1));
    const fg = fbFusionForeground(rgb, alpha, w, h);
    for (let i = 0; i < n * 3; i++) expect(fg[i]).toBeCloseTo(0.5, 3);
  });

  it('devolve o interior sólido com a cor original', () => {
    const w = 10;
    const h = 10;
    const n = w * h;
    const rgb = plane(n * 3, 1, () => 0.8);
    const alpha = plane(n, 1, () => 1);
    const fg = fbFusionForeground(rgb, alpha, w, h);
    for (let i = 0; i < n * 3; i++) expect(fg[i]).toBeCloseTo(0.8, 3);
  });
});

describe('applyCutoutData', () => {
  it('aplica o alpha no canal A e mantém RGB sem decontamination', () => {
    const w = 2;
    const h = 1;
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const alpha = new Float32Array([1, 0.5]);
    applyCutoutData(rgba, w, h, alpha, null, 0, 0);
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(128);
    expect(rgba[0]).toBe(10);
    expect(rgba[4]).toBe(40);
  });

  it('troca o RGB só na banda de borda quando há foreground corrigido', () => {
    const w = 2;
    const h = 1;
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const alpha = new Float32Array([1, 0.3]);
    const fg = new Float32Array([0.9, 0.1, 0.2]);
    applyCutoutData(rgba, w, h, alpha, fg, 1, 1);
    // interior sólido: RGB original
    expect(rgba[0]).toBe(10);
    expect(rgba[1]).toBe(20);
    expect(rgba[2]).toBe(30);
    // banda de borda: RGB do foreground (0.9, 0.1, 0.2 × 255), tolerância de 1
    // pelo arredondamento half-to-even do Uint8Clamped.
    expect(Math.abs(rgba[4] - 0.9 * 255)).toBeLessThanOrEqual(1);
    expect(Math.abs(rgba[5] - 0.1 * 255)).toBeLessThanOrEqual(1);
    expect(Math.abs(rgba[6] - 0.2 * 255)).toBeLessThanOrEqual(1);
    expect(Math.abs(rgba[7] - 0.3 * 255)).toBeLessThanOrEqual(1);
  });
});

describe('downsamplePlane', () => {
  it('reduz plano constante sem introduzir variação', () => {
    const a = plane(8, 8, () => 0.6);
    const out = downsamplePlane(a, 8, 8, 4, 4);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(0.6, 5);
  });
});

describe('fromHalfFloat', () => {
  it('decodifica valores fp16 conhecidos', () => {
    // 0x3C00 = 1.0, 0x3800 = 0.5, 0x4000 = 2.0, 0xBC00 = -1.0
    expect(fromHalfFloat(0x3c00)).toBeCloseTo(1, 5);
    expect(fromHalfFloat(0x3800)).toBeCloseTo(0.5, 5);
    expect(fromHalfFloat(0x4000)).toBeCloseTo(2, 5);
    expect(fromHalfFloat(0xbc00)).toBeCloseTo(-1, 5);
  });
});

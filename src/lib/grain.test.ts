import { describe, expect, it } from 'vitest';
import { makeGrainData, mulberry32 } from './grain';

describe('mulberry32', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(mulberry32(7)()).not.toBe(mulberry32(8)());
  });
});

describe('makeGrainData', () => {
  it('fills size*size pixels, grayscale only', () => {
    const data = makeGrainData(32, 123);
    expect(data.length).toBe(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) {
      const o = i * 4;
      expect(data[o]).toBe(data[o + 1]);
      expect(data[o + 1]).toBe(data[o + 2]);
      expect(data[o + 3]).toBe(255);
    }
  });

  it('is deterministic per seed and gaussian around mid gray', () => {
    const a = makeGrainData(64, 999);
    const b = makeGrainData(64, 999);
    expect(a).toEqual(b);

    let sum = 0;
    let within2Sigma = 0;
    const n = 64 * 64;
    for (let i = 0; i < n; i++) {
      const v = a[i * 4];
      sum += v;
      if (Math.abs(v - 128) <= 60) within2Sigma++;
    }
    // Média perto do cinza médio (neutro no overlay) e maioria perto do centro
    expect(sum / n).toBeGreaterThan(118);
    expect(sum / n).toBeLessThan(138);
    expect(within2Sigma / n).toBeGreaterThan(0.9);
  });
});

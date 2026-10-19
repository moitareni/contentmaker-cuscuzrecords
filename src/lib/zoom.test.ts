import { describe, expect, it } from 'vitest';
import { clampZoom, formatZoomPercent, zoomStepIn, zoomStepOut } from './zoom';

describe('clampZoom', () => {
  it('keeps values within 25%–400%', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(10)).toBe(4);
    expect(clampZoom(NaN)).toBe(1);
  });
});

describe('zoomStepIn', () => {
  it('goes to the next step above the current scale', () => {
    expect(zoomStepIn(1)).toBe(1.5);
    expect(zoomStepIn(0.3)).toBe(0.5);
    expect(zoomStepIn(3.5)).toBe(4);
  });

  it('stays at max when already there', () => {
    expect(zoomStepIn(4)).toBe(4);
    expect(zoomStepIn(10)).toBe(4);
  });
});

describe('zoomStepOut', () => {
  it('goes to the next step below the current scale', () => {
    expect(zoomStepOut(1)).toBe(0.75);
    expect(zoomStepOut(0.3)).toBe(0.25);
    expect(zoomStepOut(2)).toBe(1.5);
  });

  it('stays at min when already there', () => {
    expect(zoomStepOut(0.25)).toBe(0.25);
    expect(zoomStepOut(0.01)).toBe(0.25);
  });
});

describe('formatZoomPercent', () => {
  it('formats true scale as percent', () => {
    expect(formatZoomPercent(1)).toBe('100%');
    expect(formatZoomPercent(0.333)).toBe('33%');
    expect(formatZoomPercent(2.5)).toBe('250%');
  });
});

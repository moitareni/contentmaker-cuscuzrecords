import { describe, expect, it } from 'vitest';
import { alignDelta, rotatedBox, snapToCenter, snapToGuides } from './align';
import type { Box } from '../types';

describe('alignDelta', () => {
  const pageW = 1080;
  const pageH = 1440;
  const box: Box = { x: 100, y: 200, width: 300, height: 400 };

  it('aligns to horizontal center', () => {
    const { dx, dy } = alignDelta(box, 'centerH', pageW, pageH);
    expect(dx).toBe((1080 - 300) / 2 - 100); // 390 - 100 = 290
    expect(dy).toBe(0);
    expect(box.x + dx + box.width / 2).toBe(pageW / 2);
  });

  it('aligns to vertical center', () => {
    const { dx, dy } = alignDelta(box, 'centerV', pageW, pageH);
    expect(dx).toBe(0);
    expect(dy).toBe((1440 - 400) / 2 - 200); // 520 - 200 = 320
    expect(box.y + dy + box.height / 2).toBe(pageH / 2);
  });

  it('aligns to left, right, top, bottom', () => {
    expect(alignDelta(box, 'left', pageW, pageH)).toEqual({ dx: -100, dy: 0 });
    expect(alignDelta(box, 'right', pageW, pageH)).toEqual({ dx: 1080 - 300 - 100, dy: 0 });
    expect(alignDelta(box, 'top', pageW, pageH)).toEqual({ dx: 0, dy: -200 });
    expect(alignDelta(box, 'bottom', pageW, pageH)).toEqual({ dx: 0, dy: 1440 - 400 - 200 });
  });
});

describe('snapToCenter', () => {
  const pageW = 1080;
  const pageH = 1440;

  it('detects when box center is close to page center', () => {
    const box: Box = { x: 535, y: 715, width: 20, height: 20 }; // center is (545, 725), page center is (540, 720)
    const snap = snapToCenter(box, pageW, pageH, 10);
    expect(snap.v).toBe(true);
    expect(snap.h).toBe(true);
    expect(snap.dx).toBe(-5);
    expect(snap.dy).toBe(-5);
  });

  it('does not snap if outside threshold', () => {
    const box: Box = { x: 100, y: 200, width: 50, height: 50 };
    const snap = snapToCenter(box, pageW, pageH, 10);
    expect(snap.v).toBe(false);
    expect(snap.h).toBe(false);
    expect(snap.dx).toBe(0);
    expect(snap.dy).toBe(0);
  });
});

describe('snapToGuides', () => {
  const pageW = 1080;
  const pageH = 1440;

  it('snaps box edge to margin guide', () => {
    // Borda esquerda a 5px da margem de 56px
    const box: Box = { x: 51, y: 200, width: 100, height: 100 };
    const snap = snapToGuides(
      box,
      pageW,
      pageH,
      { margin: 56, useMargins: true, useCenters: false, useThirds: false },
      8
    );
    expect(snap.snappedX).toBe(true);
    expect(snap.dx).toBe(5);
    expect(snap.snappedY).toBe(false);
  });

  it('snaps box center to page center when centers enabled', () => {
    const box: Box = { x: 533, y: 713, width: 20, height: 20 }; // centro (543, 723)
    const snap = snapToGuides(
      box,
      pageW,
      pageH,
      { margin: 56, useMargins: false, useCenters: true, useThirds: false },
      8
    );
    expect(snap.snappedX).toBe(true);
    expect(snap.snappedY).toBe(true);
    expect(snap.dx).toBe(-3);
    expect(snap.dy).toBe(-3);
  });

  it('snaps to third lines', () => {
    // Terço vertical em 360px; borda esquerda a 4px dele
    const box: Box = { x: 356, y: 100, width: 100, height: 100 };
    const snap = snapToGuides(
      box,
      pageW,
      pageH,
      { margin: 56, useMargins: false, useCenters: false, useThirds: true },
      8
    );
    expect(snap.snappedX).toBe(true);
    expect(snap.dx).toBe(4);
  });

  it('does not snap when all layers disabled or outside threshold', () => {
    const box: Box = { x: 51, y: 200, width: 100, height: 100 };
    const off = snapToGuides(
      box,
      pageW,
      pageH,
      { margin: 56, useMargins: false, useCenters: false, useThirds: false },
      8
    );
    expect(off).toEqual({ dx: 0, dy: 0, snappedX: false, snappedY: false });

    const far: Box = { x: 200, y: 300, width: 100, height: 100 };
    const farSnap = snapToGuides(
      far,
      pageW,
      pageH,
      { margin: 56, useMargins: true, useCenters: true, useThirds: true },
      8
    );
    expect(farSnap.snappedX).toBe(false);
    expect(farSnap.snappedY).toBe(false);
  });
});

describe('rotatedBox', () => {
  it('keeps dimensions at 0 degrees', () => {
    const box = rotatedBox(500, 500, 200, 100, 0);
    expect(box.width).toBeCloseTo(200);
    expect(box.height).toBeCloseTo(100);
    expect(box.x).toBeCloseTo(400);
    expect(box.y).toBeCloseTo(450);
  });

  it('swaps dimensions at 90 degrees', () => {
    const box = rotatedBox(500, 500, 200, 100, 90);
    expect(box.width).toBeCloseTo(100);
    expect(box.height).toBeCloseTo(200);
  });
});

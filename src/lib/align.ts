import type { AlignMode, Box } from '../types';

/** Deslocamento necessário para alinhar a caixa (já rotacionada/escalada) à página. */
export function alignDelta(box: Box, mode: AlignMode, pageW: number, pageH: number): { dx: number; dy: number } {
  switch (mode) {
    case 'left':
      return { dx: -box.x, dy: 0 };
    case 'centerH':
      return { dx: (pageW - box.width) / 2 - box.x, dy: 0 };
    case 'right':
      return { dx: pageW - box.width - box.x, dy: 0 };
    case 'top':
      return { dx: 0, dy: -box.y };
    case 'centerV':
      return { dx: 0, dy: (pageH - box.height) / 2 - box.y };
    case 'bottom':
      return { dx: 0, dy: pageH - box.height - box.y };
  }
}

/** Ímã no centro da página: devolve o ajuste e quais guias mostrar. */
export function snapToCenter(box: Box, pageW: number, pageH: number, threshold: number) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const offX = pageW / 2 - cx;
  const offY = pageH / 2 - cy;
  const v = Math.abs(offX) <= threshold;
  const h = Math.abs(offY) <= threshold;
  return { dx: v ? offX : 0, dy: h ? offY : 0, v, h };
}

export interface GuideSnapOptions {
  margin: number;
  useMargins: boolean;
  useCenters: boolean;
  useThirds: boolean;
}

/**
 * Ímã nas guias de layout (margens + centro + terços).
 * Testa borda esquerda/centro/direita (e topo/meio/base) do elemento
 * contra cada linha-guia ativa e aplica o ajuste mais próximo por eixo.
 */
export function snapToGuides(
  box: Box,
  pageW: number,
  pageH: number,
  opts: GuideSnapOptions,
  threshold: number
): { dx: number; dy: number; snappedX: boolean; snappedY: boolean } {
  const linesX: number[] = [];
  const linesY: number[] = [];
  const m = opts.margin;

  if (opts.useMargins && m > 0) {
    linesX.push(m, pageW - m);
    linesY.push(m, pageH - m);
  }
  if (opts.useCenters) {
    linesX.push(pageW / 2);
    linesY.push(pageH / 2);
  }
  if (opts.useThirds) {
    linesX.push(pageW / 3, (2 * pageW) / 3);
    linesY.push(pageH / 3, (2 * pageH) / 3);
  }

  let dx = 0;
  let dy = 0;
  let snappedX = false;
  let snappedY = false;

  if (linesX.length > 0) {
    const edgesX = [box.x, box.x + box.width / 2, box.x + box.width];
    let best = threshold + 1;
    for (const edge of edgesX) {
      for (const line of linesX) {
        const dist = Math.abs(line - edge);
        if (dist <= threshold && dist < best) {
          best = dist;
          dx = line - edge;
          snappedX = true;
        }
      }
    }
  }

  if (linesY.length > 0) {
    const edgesY = [box.y, box.y + box.height / 2, box.y + box.height];
    let best = threshold + 1;
    for (const edge of edgesY) {
      for (const line of linesY) {
        const dist = Math.abs(line - edge);
        if (dist <= threshold && dist < best) {
          best = dist;
          dy = line - edge;
          snappedY = true;
        }
      }
    }
  }

  return { dx, dy, snappedX, snappedY };
}

/** Caixa (eixos alinhados) de um retângulo w×h centrado em (cx, cy), girado em `deg` e escalado. */
export function rotatedBox(cx: number, cy: number, w: number, h: number, deg: number): Box {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const bw = w * c + h * s;
  const bh = w * s + h * c;
  return { x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh };
}

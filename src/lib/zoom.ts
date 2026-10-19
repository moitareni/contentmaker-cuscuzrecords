import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS } from '../brand/brand';

/** Prende o fator de zoom nos limites 25%–400%. */
export function clampZoom(factor: number): number {
  if (Number.isNaN(factor)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor));
}

/** Próximo passo de zoom acima da escala real atual (para o botão + e Ctrl+=). */
export function zoomStepIn(trueScale: number): number {
  for (const step of ZOOM_STEPS) {
    if (step > trueScale * 1.001) return step;
  }
  return ZOOM_MAX;
}

/** Próximo passo de zoom abaixo da escala real atual (para o botão − e Ctrl+−). */
export function zoomStepOut(trueScale: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < trueScale * 0.999) return ZOOM_STEPS[i];
  }
  return ZOOM_MIN;
}

/** Rótulo do zoom em escala real, ex.: 0.333 → "33%". */
export function formatZoomPercent(trueScale: number): string {
  return `${Math.round(trueScale * 100)}%`;
}

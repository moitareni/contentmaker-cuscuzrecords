import { BODY_MAX_WITHOUT_HEADING, FONT_SIZE_MAX, FONT_SIZE_MIN } from '../brand/brand';
import type { El, TextEl } from '../types';

const isText = (e: El): e is TextEl => e.kind === 'text';
export const isHeading = (t: TextEl) => t.style !== 'body';

/** Tamanho efetivo (considera escala, por segurança). */
export const effectiveSize = (t: TextEl) => t.fontSize * t.scale;

export interface SizeLimits {
  min: number;
  max: number;
  /** Qual regra definiu o limite (para a mensagem de erro e a marquinha do slider). */
  reason: 'heading' | 'noHeading' | 'body' | 'absolute';
}

/**
 * Limites de tamanho para um texto, dado o restante do post.
 * - Texto (body): máx = menor Título/Destaque; sem títulos = 72px.
 * - Título/Destaque: mín = maior Texto.
 */
export function textSizeLimits(elements: El[], target: Pick<TextEl, 'id' | 'style'>): SizeLimits {
  const others = elements.filter(isText).filter((t) => t.id !== target.id);
  if (target.style === 'body') {
    const headings = others.filter(isHeading);
    if (headings.length === 0) return { min: FONT_SIZE_MIN, max: BODY_MAX_WITHOUT_HEADING, reason: 'noHeading' };
    return { min: FONT_SIZE_MIN, max: Math.min(...headings.map(effectiveSize)), reason: 'heading' };
  }
  const bodies = others.filter((t) => !isHeading(t));
  if (bodies.length === 0) return { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX, reason: 'absolute' };
  return { min: Math.max(FONT_SIZE_MIN, ...bodies.map(effectiveSize)), max: FONT_SIZE_MAX, reason: 'body' };
}

export interface ClampResult {
  value: number;
  /** Mensagem de erro quando o valor pedido violou a regra. */
  error: string | null;
}

export function clampTextSize(elements: El[], target: Pick<TextEl, 'id' | 'style'>, requested: number): ClampResult {
  const { min, max, reason } = textSizeLimits(elements, target);
  const r = Math.round(requested);
  if (r > max) {
    const error =
      reason === 'heading'
        ? 'Opa! O texto não pode ficar maior que o título 🙈'
        : reason === 'noHeading'
          ? `Opa! Sem título no post, o texto vai até ${BODY_MAX_WITHOUT_HEADING}px 🙈`
          : `Esse é o tamanho máximo (${FONT_SIZE_MAX}px) 🙈`;
    return { value: Math.floor(max), error };
  }
  if (r < min) {
    const error = reason === 'body' ? 'Opa! O título não pode ficar menor que o texto 🙈' : `Esse é o tamanho mínimo (${FONT_SIZE_MIN}px) 🙈`;
    return { value: Math.ceil(min), error };
  }
  return { value: r, error: null };
}

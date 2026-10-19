import type { CSSProperties } from 'react';
import { BRAND_EFFECT, COLORS, FONT_BODY, FONT_HEADLINE } from '../brand/brand';
import type { TextEl } from '../types';

export interface EditorTextStyleOptions {
  /** Escala entre o canvas real (1080×1440) e o display na tela. */
  scaleRatio: number;
  /** Expansão da borda em volta do texto, em px do post (0 sem borda). */
  padX: number;
  padY: number;
}

/**
 * Estilo CSS que replica o traço do KonvaText para edição in-place
 * estilo Photoshop: mesma fonte, tamanho, cor, alinhamento e uma
 * aproximação do Efeito da Marca (traçado + sombra) via CSS.
 * Pura e testável — ver textEditorStyle.test.ts.
 */
export function editorTextStyle(el: TextEl, opts: EditorTextStyleOptions): CSSProperties {
  const { scaleRatio, padX, padY } = opts;
  const isHeadline = el.style !== 'body';
  const color = COLORS[el.color as keyof typeof COLORS] ?? COLORS.preto;

  const style: CSSProperties = {
    fontFamily: `'${isHeadline ? FONT_HEADLINE : FONT_BODY}', sans-serif`,
    fontWeight: isHeadline ? 900 : 'bold',
    fontSize: `${el.fontSize * scaleRatio}px`,
    lineHeight: el.lineHeight,
    letterSpacing: `${el.letterSpacing * scaleRatio}px`,
    textAlign: el.align,
    textTransform: el.uppercase ? 'uppercase' : 'none',
    color,
    padding: `${padY * scaleRatio}px ${padX * scaleRatio}px`,
    caretColor: COLORS.preto,
  };

  if (el.brandEffect) {
    // Aproximação do traçado creme 2px + sombra projetada da marca.
    style.WebkitTextStroke = `${BRAND_EFFECT.strokeOutside * scaleRatio}px ${BRAND_EFFECT.strokeColor}`;
    style.textShadow = `0px ${BRAND_EFFECT.shadowDistance * scaleRatio}px ${BRAND_EFFECT.shadowBlur * scaleRatio}px rgba(11, 5, 0, ${BRAND_EFFECT.shadowOpacity})`;
  }

  return style;
}

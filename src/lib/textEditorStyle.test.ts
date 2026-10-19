import { describe, expect, it } from 'vitest';
import { BRAND_EFFECT, COLORS } from '../brand/brand';
import type { TextEl } from '../types';
import { editorTextStyle } from './textEditorStyle';

const baseEl: TextEl = {
  id: 't1',
  kind: 'text',
  style: 'title',
  text: 'Prato do dia',
  x: 540,
  y: 720,
  rotation: 0,
  scale: 1,
  fontSize: 120,
  lineHeight: 0.95,
  letterSpacing: 0,
  align: 'center',
  uppercase: true,
  color: 'preto',
  brandEffect: true,
  border: 'none',
};

describe('editorTextStyle', () => {
  it('scales font size and letter spacing by scaleRatio', () => {
    const s = editorTextStyle(baseEl, { scaleRatio: 0.5, padX: 0, padY: 0 });
    expect(s.fontSize).toBe('60px');
    expect(s.letterSpacing).toBe('0px');
    expect(s.lineHeight).toBe(0.95);
  });

  it('uses headline font for title and body font otherwise', () => {
    const title = editorTextStyle(baseEl, { scaleRatio: 1, padX: 0, padY: 0 });
    expect(title.fontFamily).toContain('Londrina Solid');
    expect(title.fontWeight).toBe(900);

    const body = editorTextStyle({ ...baseEl, style: 'body' }, { scaleRatio: 1, padX: 0, padY: 0 });
    expect(body.fontFamily).toContain('PT Sans Narrow');
    expect(body.fontWeight).toBe('bold');
  });

  it('applies brand colors, uppercase and alignment', () => {
    const s = editorTextStyle(baseEl, { scaleRatio: 1, padX: 0, padY: 0 });
    expect(s.color).toBe(COLORS.preto);
    expect(s.textTransform).toBe('uppercase');
    expect(s.textAlign).toBe('center');
  });

  it('approximates the brand effect with stroke and shadow', () => {
    const s = editorTextStyle(baseEl, { scaleRatio: 0.5, padX: 0, padY: 0 });
    expect(s.WebkitTextStroke).toBe(
      `${BRAND_EFFECT.strokeOutside * 0.5}px ${BRAND_EFFECT.strokeColor}`
    );
    expect(s.textShadow).toContain(`${BRAND_EFFECT.shadowDistance * 0.5}px`);
  });

  it('omits stroke and shadow without brand effect and pads for borders', () => {
    const s = editorTextStyle(
      { ...baseEl, brandEffect: false },
      { scaleRatio: 0.5, padX: 10, padY: 4 }
    );
    expect(s.WebkitTextStroke).toBeUndefined();
    expect(s.textShadow).toBeUndefined();
    expect(s.padding).toBe('2px 5px');
  });
});

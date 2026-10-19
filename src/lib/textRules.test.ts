import { describe, expect, it } from 'vitest';
import { clampTextSize, textSizeLimits } from './textRules';
import { BODY_MAX_WITHOUT_HEADING } from '../brand/brand';
import type { El, TextEl } from '../types';

describe('textRules', () => {
  const createText = (id: string, style: 'title' | 'body' | 'highlight', fontSize: number, scale = 1): TextEl => ({
    id,
    kind: 'text',
    style,
    text: 'Test',
    x: 0,
    y: 0,
    rotation: 0,
    scale,
    fontSize,
    lineHeight: 1,
    letterSpacing: 0,
    align: 'center',
    uppercase: false,
    color: 'preto',
    brandEffect: false,
    border: 'none',
  });

  describe('textSizeLimits', () => {
    it('sets max to BODY_MAX_WITHOUT_HEADING (72) if no heading exists for a body text', () => {
      const elements: El[] = [createText('body1', 'body', 40)];
      const limits = textSizeLimits(elements, { id: 'body1', style: 'body' });
      expect(limits.max).toBe(BODY_MAX_WITHOUT_HEADING);
      expect(limits.reason).toBe('noHeading');
    });

    it('sets max to lowest heading size if headings exist', () => {
      const elements: El[] = [
        createText('body1', 'body', 40),
        createText('title1', 'title', 120),
        createText('highlight1', 'highlight', 90),
      ];
      const limits = textSizeLimits(elements, { id: 'body1', style: 'body' });
      expect(limits.max).toBe(90);
      expect(limits.reason).toBe('heading');
    });

    it('sets min for a heading to the largest body text', () => {
      const elements: El[] = [
        createText('body1', 'body', 50),
        createText('body2', 'body', 60),
        createText('title1', 'title', 120),
      ];
      const limits = textSizeLimits(elements, { id: 'title1', style: 'title' });
      expect(limits.min).toBe(60);
      expect(limits.reason).toBe('body');
    });
  });

  describe('clampTextSize', () => {
    it('allows body size within limit without error', () => {
      const elements: El[] = [createText('title1', 'title', 100)];
      const res = clampTextSize(elements, { id: 'b1', style: 'body' }, 80);
      expect(res.value).toBe(80);
      expect(res.error).toBeNull();
    });

    it('blocks body size exceeding heading and returns custom error', () => {
      const elements: El[] = [createText('title1', 'title', 100)];
      const res = clampTextSize(elements, { id: 'b1', style: 'body' }, 110);
      expect(res.value).toBe(100);
      expect(res.error).toBe('Opa! O texto não pode ficar maior que o título 🙈');
    });

    it('blocks body size exceeding 72px when no heading and returns custom error', () => {
      const elements: El[] = [];
      const res = clampTextSize(elements, { id: 'b1', style: 'body' }, 90);
      expect(res.value).toBe(72);
      expect(res.error).toBe('Opa! Sem título no post, o texto vai até 72px 🙈');
    });

    it('blocks heading size shrinking below body text', () => {
      const elements: El[] = [createText('b1', 'body', 50)];
      const res = clampTextSize(elements, { id: 't1', style: 'title' }, 40);
      expect(res.value).toBe(50);
      expect(res.error).toBe('Opa! O título não pode ficar menor que o texto 🙈');
    });
  });
});

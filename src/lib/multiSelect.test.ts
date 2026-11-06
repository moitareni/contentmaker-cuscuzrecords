import { describe, expect, it } from 'vitest';
import { IMAGE_MAX_COUNT } from '../brand/brand';
import type { El, ImageEl, LogoEl, TextEl } from '../types';
import {
  applyElPatches,
  buildTransformPatches,
  duplicateGroup,
  enforceTextRule,
  groupLimitMessage,
  groupScaleBounds,
  isMultiModifier,
  normalizeRotation,
  pruneIds,
  reorderBackward,
  reorderForward,
  shiftPatches,
  toggleId,
  unionBox,
} from './multiSelect';
import { clampTextSize } from './textRules';

const base = { x: 100, y: 100, rotation: 0, scale: 1 };
const text = (id: string, style: TextEl['style'], fontSize: number): TextEl => ({
  ...base,
  id,
  kind: 'text',
  style,
  text: id,
  fontSize,
  lineHeight: 1,
  letterSpacing: 0,
  align: 'center',
  uppercase: false,
  color: 'preto',
  brandEffect: false,
  border: 'none',
});
const deco = (id: string): El => ({ ...base, id, kind: 'decoration', assetId: 'a', flipX: false, flipY: false });
const logo = (id: string): LogoEl => ({ ...base, id, kind: 'logo', variant: 'paper' });
const img = (id: string): ImageEl => ({
  ...base,
  id,
  kind: 'image',
  imageId: `i-${id}`,
  name: id,
  width: 100,
  height: 100,
  flipX: false,
  flipY: false,
});
const ids = (els: El[]) => els.map((e) => e.id);

describe('seleção: modificadores e toggle', () => {
  it('Ctrl, Cmd e Shift contam; clique simples não', () => {
    expect(isMultiModifier({ ctrlKey: true })).toBe(true);
    expect(isMultiModifier({ metaKey: true })).toBe(true);
    expect(isMultiModifier({ shiftKey: true })).toBe(true);
    expect(isMultiModifier({})).toBe(false);
    expect(isMultiModifier(undefined)).toBe(false);
  });
  it('toggleId adiciona ao fim e remove sem mutar', () => {
    const a = ['a'];
    expect(toggleId(a, 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
    expect(a).toEqual(['a']);
  });
  it('pruneIds descarta ids fantasmas e duplicados mantendo a ordem', () => {
    expect(pruneIds(['c', 'a', 'x', 'a'], [deco('a'), deco('c')])).toEqual(['c', 'a']);
  });
});

describe('geometria', () => {
  it('unionBox engloba tudo; vazio = null', () => {
    expect(unionBox([])).toBeNull();
    expect(
      unionBox([
        { x: 0, y: 10, width: 50, height: 50 },
        { x: 100, y: 0, width: 20, height: 20 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 120, height: 60 });
  });
  it('normalizeRotation vai para [-180,180) com 2 casas', () => {
    expect(normalizeRotation(190)).toBe(-170);
    expect(normalizeRotation(-190)).toBe(170);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(12.3456)).toBe(12.35);
    expect(normalizeRotation(180)).toBe(-180);
  });
});

describe('groupScaleBounds (Texto ≤ Título em conjunto)', () => {
  it('só título + texto selecionados, sem outros: razão preservada, só limites absolutos', () => {
    const els = [text('h', 'title', 100), text('b', 'body', 50)];
    const b = groupScaleBounds(els, ['h', 'b']);
    expect(b.min).toBeCloseTo(16 / 50);
    expect(b.max).toBeCloseTo(320 / 100);
  });
  it('só corpo selecionado e há título fora: teto = título', () => {
    const els = [text('h', 'title', 100), text('b', 'body', 50)];
    const b = groupScaleBounds(els, ['b']);
    expect(b.max).toBeCloseTo(2);
    expect(b.maxReason).toBe('heading');
  });
  it('corpo selecionado e nenhum título no post: teto 72px', () => {
    const els = [text('b', 'body', 36), deco('d')];
    const b = groupScaleBounds(els, ['b', 'd']);
    expect(b.max).toBeCloseTo(2);
    expect(b.maxReason).toBe('noHeading');
  });
  it('só título selecionado e há corpo fora: piso = corpo', () => {
    const els = [text('h', 'title', 100), text('b', 'body', 50)];
    const b = groupScaleBounds(els, ['h']);
    expect(b.min).toBeCloseTo(0.5);
    expect(b.minReason).toBe('body');
  });
  it('sem texto selecionado: sem limites', () => {
    const b = groupScaleBounds([text('b', 'body', 50), deco('d')], ['d']);
    expect(b).toEqual({ min: 0, max: Infinity, minReason: null, maxReason: null });
  });
  it('limites cruzados (doc inconsistente) travam em 1', () => {
    const els = [text('h', 'title', 40), text('b', 'body', 60), text('h2', 'title', 200)];
    // h selecionado: piso = 60/40=1.5; b selecionado ... teto = menor título FORA (h2=200)/60 → >1.5, ok
    const ok = groupScaleBounds(els, ['h']);
    expect(ok.min).toBeCloseTo(1.5);
    const cross = groupScaleBounds([text('h', 'title', 20), text('b', 'body', 30), text('b2', 'body', 400)], ['h']);
    // piso 400/20 = 20 > teto absoluto 320/20 = 16 → cruza
    expect(cross.min).toBe(1);
    expect(cross.max).toBe(1);
  });
  it('arredondar fonte no teto nunca viola a regra (corpo ≤ título)', () => {
    const els = [text('h', 'title', 73), text('b', 'body', 37), deco('d')];
    const { max } = groupScaleBounds(els, ['b']);
    expect(Math.round(37 * max)).toBeLessThanOrEqual(73);
  });
  it('mensagens idênticas às de clampTextSize', () => {
    const els = [text('h', 'title', 100), text('b', 'body', 50)];
    const viaClamp = clampTextSize(els, els[1], 999).error;
    expect(groupLimitMessage('heading', 'max')).toBe(viaClamp);
    const noTitle = [text('b', 'body', 50)];
    expect(groupLimitMessage('noHeading', 'max')).toBe(clampTextSize(noTitle, noTitle[0], 999).error);
    expect(groupLimitMessage('body', 'min')).toBe(clampTextSize(els, els[0], 1).error);
    expect(groupLimitMessage('absolute', 'min')).toBe(clampTextSize([els[0]], els[0], 1).error);
    expect(groupLimitMessage('absolute', 'max')).toBe(clampTextSize([els[0]], els[0], 9999).error);
    expect(groupLimitMessage(null, 'max')).toBeNull();
  });
});

describe('enforceTextRule', () => {
  it('limita corpo ao menor título e todo texto a 16–320', () => {
    const out = enforceTextRule([text('h', 'title', 60), text('b', 'body', 90), text('t', 'highlight', 500)]) as TextEl[];
    expect(out.find((t) => t.id === 'b')!.fontSize).toBe(60);
    expect(out.find((t) => t.id === 't')!.fontSize).toBe(320);
  });
  it('sem título: corpo ≤ 72', () => {
    const out = enforceTextRule([text('b', 'body', 90)]) as TextEl[];
    expect(out[0].fontSize).toBe(72);
  });
  it('não toca em quem já cumpre (mesma referência)', () => {
    const els = [text('h', 'title', 60), text('b', 'body', 40)];
    const out = enforceTextRule(els);
    expect(out[0]).toBe(els[0]);
    expect(out[1]).toBe(els[1]);
  });
});

describe('buildTransformPatches (commit em lote)', () => {
  it('texto vira fontSize (scale=1); demais viram scale', () => {
    const els: El[] = [text('h', 'title', 100), text('b', 'body', 50), { ...deco('d'), scale: 2 }];
    const patches = buildTransformPatches(els, [
      { id: 'h', x: 10.123, y: 20, rotation: 190, scaleX: 0.5 },
      { id: 'b', x: 11, y: 21, rotation: 190, scaleX: 0.5 },
      { id: 'd', x: 12, y: 22, rotation: 190, scaleX: 3 },
    ]);
    const h = patches.find((p) => p.id === 'h')!.patch as Partial<TextEl>;
    const b = patches.find((p) => p.id === 'b')!.patch as Partial<TextEl>;
    const d = patches.find((p) => p.id === 'd')!.patch;
    expect(h.fontSize).toBe(50);
    expect(b.fontSize).toBe(25);
    expect(h.scale).toBe(1);
    expect(h.x).toBe(10.12);
    expect(h.rotation).toBe(-170);
    expect(d.scale).toBe(3);
  });
  it('encolher título + texto juntos NÃO trava o título (validação no conjunto final)', () => {
    const els: El[] = [text('h', 'title', 100), text('b', 'body', 90)];
    const patches = buildTransformPatches(els, [
      { id: 'h', x: 0, y: 0, rotation: 0, scaleX: 0.5 },
      { id: 'b', x: 0, y: 0, rotation: 0, scaleX: 0.5 },
    ]);
    expect((patches[0].patch as Partial<TextEl>).fontSize).toBe(50);
    expect((patches[1].patch as Partial<TextEl>).fontSize).toBe(45);
  });
  it('rede de segurança: corpo acima do título é rebaixado', () => {
    const els: El[] = [text('h', 'title', 100), text('b', 'body', 50)];
    const patches = buildTransformPatches(els, [{ id: 'b', x: 0, y: 0, rotation: 0, scaleX: 3 }]);
    expect((patches[0].patch as Partial<TextEl>).fontSize).toBe(100);
  });
  it('id desconhecido é ignorado', () => {
    expect(buildTransformPatches([deco('d')], [{ id: 'zzz', x: 0, y: 0, rotation: 0, scaleX: 1 }])).toEqual([]);
  });
});

describe('mover e aplicar patches', () => {
  it('shiftPatches só afeta os ids pedidos', () => {
    const els = [deco('a'), deco('b'), deco('c')];
    const p = shiftPatches(els, ['a', 'c'], 5, -5);
    expect(p.map((x) => x.id)).toEqual(['a', 'c']);
    expect(p[0].patch).toEqual({ x: 105, y: 95 });
  });
  it('applyElPatches preserva referência de quem não mudou', () => {
    const els = [deco('a'), deco('b')];
    const out = applyElPatches(els, [{ id: 'a', patch: { x: 1 } }]);
    expect(out[0].x).toBe(1);
    expect(out[1]).toBe(els[1]);
  });
});

describe('camadas', () => {
  const els = ['a', 'b', 'c', 'd', 'e'].map(deco);
  it('subir bloco contíguo preserva ordem relativa', () => {
    expect(ids(reorderForward(els, ['b', 'c']))).toEqual(['a', 'd', 'b', 'c', 'e']);
  });
  it('subir não contíguos: cada um sobe uma posição', () => {
    expect(ids(reorderForward(els, ['a', 'c']))).toEqual(['b', 'a', 'd', 'c', 'e']);
  });
  it('quem está no topo fica; o resto sobe', () => {
    expect(ids(reorderForward(els, ['d', 'e']))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(reorderForward(els, ['c', 'e']))).toEqual(['a', 'b', 'd', 'c', 'e']);
  });
  it('descer espelha', () => {
    expect(ids(reorderBackward(els, ['c', 'd']))).toEqual(['a', 'c', 'd', 'b', 'e']);
    expect(ids(reorderBackward(els, ['a', 'b']))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('um elemento = mesmo comportamento do swap de hoje', () => {
    expect(ids(reorderForward(els, ['b']))).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(ids(reorderBackward(els, ['b']))).toEqual(['b', 'a', 'c', 'd', 'e']);
  });
  it('não muta a entrada', () => {
    reorderForward(els, ['b']);
    expect(ids(els)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('duplicateGroup', () => {
  const mk = () => {
    let n = 0;
    return () => `n${++n}`;
  };
  it('copia como bloco acima do mais alto selecionado, com offset', () => {
    const els = [deco('a'), deco('b'), deco('c')];
    const r = duplicateGroup(els, ['a', 'b'], mk());
    expect(ids(r.elements)).toEqual(['a', 'b', 'n1', 'n2', 'c']);
    expect(r.copyIds).toEqual(['n1', 'n2']);
    expect(r.elements[2].x).toBe(132);
    expect(r.blocked).toBeNull();
  });
  it('ignora a logo (limite 1) mas duplica o resto', () => {
    const r = duplicateGroup([deco('a'), logo('l')], ['a', 'l'], mk());
    expect(r.skippedLogo).toBe(true);
    expect(r.copyIds).toHaveLength(1);
    expect(r.elements.filter((e) => e.kind === 'logo')).toHaveLength(1);
  });
  it('só logo: bloqueia', () => {
    const els = [logo('l')];
    const r = duplicateGroup(els, ['l'], mk());
    expect(r.blocked).toBe('onlyLogo');
    expect(r.elements).toBe(els);
  });
  it('imagens: tudo-ou-nada contra o limite', () => {
    const four = Array.from({ length: IMAGE_MAX_COUNT - 1 }, (_, i) => img(`i${i}`));
    const els = [...four, deco('d')];
    const ok = duplicateGroup(els, ['i0', 'd'], mk());
    expect(ok.blocked).toBeNull();
    const blocked = duplicateGroup(els, ['i0', 'i1', 'd'], mk());
    expect(blocked.blocked).toBe('noImageSlots');
    expect(blocked.elements).toBe(els);
    expect(blocked.copyIds).toEqual([]);
  });
  it('seleção vazia/inexistente não faz nada', () => {
    const els = [deco('a')];
    const r = duplicateGroup(els, ['zzz'], mk());
    expect(r.copyIds).toEqual([]);
    expect(r.blocked).toBeNull();
    expect(r.elements).toBe(els);
  });
});

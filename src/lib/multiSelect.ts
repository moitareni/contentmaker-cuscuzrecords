import { BODY_MAX_WITHOUT_HEADING, FONT_SIZE_MAX, FONT_SIZE_MIN, IMAGE_MAX_COUNT } from '../brand/brand';
import type { Box, El, TextEl } from '../types';
import { countImages } from './imageRules';
import { effectiveSize, isHeading } from './textRules';

/**
 * Regras puras da seleção múltipla (sem Konva, sem store): fáceis de testar e
 * reaproveitadas pelo canvas, pelos atalhos e pelas ações em lote do store.
 */

const isText = (e: El): e is TextEl => e.kind === 'text';

/** Ctrl (Windows/Linux), Cmd (Mac) ou Shift: qualquer um deles soma/remove da seleção. */
export function isMultiModifier(evt?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } | null): boolean {
  return !!evt && (!!evt.ctrlKey || !!evt.metaKey || !!evt.shiftKey);
}

/** Alterna um id na seleção (adiciona ao fim ou remove), sem mutar. */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
}

/** Mantém só ids que ainda existem no doc (ex.: após undo/redo), sem duplicatas e na mesma ordem. */
export function pruneIds(ids: string[], elements: El[]): string[] {
  const alive = new Set(elements.map((e) => e.id));
  const seen = new Set<string>();
  return ids.filter((id) => alive.has(id) && !seen.has(id) && seen.add(id));
}

/** Caixa que engloba todas as caixas dadas (null se vazio). */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Normaliza para [-180, 180) com 2 casas (inteiro deslocaria elementos entre si em grupo). */
export function normalizeRotation(deg: number): number {
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Math.round(wrapped * 100) / 100;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Texto ≤ Título ao escalar um conjunto
// ---------------------------------------------------------------------------

export type GroupLimitReason = 'heading' | 'noHeading' | 'body' | 'absolute';

export interface GroupScaleBounds {
  /** Menor/maior fator de escala uniforme que mantém todas as regras de texto. */
  min: number;
  max: number;
  /** Qual regra definiu cada limite (para o toast). */
  minReason: GroupLimitReason | null;
  maxReason: GroupLimitReason | null;
}

/**
 * Limites do fator de escala uniforme do conjunto `ids`. Textos selecionados
 * escalam juntos (a razão título/texto é preservada), então só importam:
 *  - corpo selecionado × títulos NÃO selecionados (ou 72px se não há título);
 *  - título selecionado × corpos NÃO selecionados;
 *  - limites absolutos de fonte (16–320px).
 * Fatores são calculados para que `round(fontSize × fator)` nunca viole a regra.
 */
export function groupScaleBounds(elements: El[], ids: string[]): GroupScaleBounds {
  const sel = new Set(ids);
  const texts = elements.filter(isText);
  const picked = texts.filter((t) => sel.has(t.id));
  const rest = texts.filter((t) => !sel.has(t.id));
  const none: GroupScaleBounds = { min: 0, max: Infinity, minReason: null, maxReason: null };
  if (picked.length === 0) return none;

  let min = 0;
  let max = Infinity;
  let minReason: GroupLimitReason | null = null;
  let maxReason: GroupLimitReason | null = null;
  const lowerTo = (v: number, r: GroupLimitReason) => {
    if (v > min) {
      min = v;
      minReason = r;
    }
  };
  const upperTo = (v: number, r: GroupLimitReason) => {
    if (v < max) {
      max = v;
      maxReason = r;
    }
  };

  for (const t of picked) {
    const size = effectiveSize(t);
    lowerTo(FONT_SIZE_MIN / size, 'absolute');
    upperTo(FONT_SIZE_MAX / size, 'absolute');
  }

  const bodies = picked.filter((t) => !isHeading(t));
  const heads = picked.filter(isHeading);

  if (bodies.length > 0) {
    const biggestBody = Math.max(...bodies.map(effectiveSize));
    const restHeads = rest.filter(isHeading).map(effectiveSize);
    if (restHeads.length > 0) {
      upperTo(Math.floor(Math.min(...restHeads)) / biggestBody, 'heading');
    } else if (heads.length === 0) {
      upperTo(BODY_MAX_WITHOUT_HEADING / biggestBody, 'noHeading');
    }
  }
  if (heads.length > 0) {
    const restBodies = rest.filter((t) => !isHeading(t)).map(effectiveSize);
    if (restBodies.length > 0) {
      lowerTo(Math.ceil(Math.max(...restBodies)) / Math.min(...heads.map(effectiveSize)), 'body');
    }
  }

  // Doc já inconsistente (limites se cruzam): trava no tamanho atual.
  if (min > max) return { min: 1, max: 1, minReason, maxReason };
  return { min, max, minReason, maxReason };
}

/** Mesmas mensagens de `clampTextSize` (AGENTS.md §2.6). */
export function groupLimitMessage(reason: GroupLimitReason | null, direction: 'max' | 'min'): string | null {
  if (!reason) return null;
  if (direction === 'max') {
    if (reason === 'heading') return 'Opa! O texto não pode ficar maior que o título 🙈';
    if (reason === 'noHeading') return `Opa! Sem título no post, o texto vai até ${BODY_MAX_WITHOUT_HEADING}px 🙈`;
    return `Esse é o tamanho máximo (${FONT_SIZE_MAX}px) 🙈`;
  }
  if (reason === 'body') return 'Opa! O título não pode ficar menor que o texto 🙈';
  return `Esse é o tamanho mínimo (${FONT_SIZE_MIN}px) 🙈`;
}

/**
 * Rede de segurança final (após arredondar fontes): limita corpos ao menor
 * título (ou 72px sem título) e todo texto a 16–320px. Não mexe em quem já cumpre.
 */
export function enforceTextRule(elements: El[]): El[] {
  const texts = elements.filter(isText);
  const headings = texts.filter(isHeading);
  const bodyCap = headings.length > 0 ? Math.floor(Math.min(...headings.map(effectiveSize))) : BODY_MAX_WITHOUT_HEADING;
  return elements.map((e) => {
    if (e.kind !== 'text') return e;
    let size = e.fontSize;
    if (!isHeading(e)) size = Math.min(size, bodyCap);
    size = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size));
    return size === e.fontSize ? e : { ...e, fontSize: size };
  });
}

// ---------------------------------------------------------------------------
// Commit em lote
// ---------------------------------------------------------------------------

export interface NodeResult {
  id: string;
  x: number;
  y: number;
  rotation: number;
  /** Escala absoluta do nó Konva depois da transformação. */
  scaleX: number;
}

export interface ElPatch {
  id: string;
  patch: Partial<El>;
}

/**
 * Converte o resultado do Transformer (um por nó) em patches do doc.
 * Texto: a escala vira `fontSize` (scale volta a 1); demais: `scale = |scaleX|`.
 * A regra Texto ≤ Título é validada sobre o conjunto FINAL (não nó a nó).
 */
export function buildTransformPatches(elements: El[], results: NodeResult[]): ElPatch[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  const merged = elements.map((e): El => {
    const r = byId.get(e.id);
    if (!r) return e;
    const base = { x: round2(r.x), y: round2(r.y), rotation: normalizeRotation(r.rotation) };
    const s = Math.abs(r.scaleX);
    if (e.kind === 'text') return { ...e, ...base, scale: 1, fontSize: Math.round(e.fontSize * s) };
    return { ...e, ...base, scale: s } as El;
  });
  const final = enforceTextRule(merged);
  const finalById = new Map(final.map((e) => [e.id, e]));
  return results.flatMap(({ id }) => {
    const e = finalById.get(id);
    if (!e) return [];
    const patch: Partial<El> = { x: e.x, y: e.y, rotation: e.rotation, scale: e.scale };
    if (e.kind === 'text') (patch as Partial<TextEl>).fontSize = e.fontSize;
    return [{ id, patch }];
  });
}

/** Move todos os `ids` por (dx, dy). */
export function shiftPatches(elements: El[], ids: string[], dx: number, dy: number): ElPatch[] {
  const sel = new Set(ids);
  return elements.filter((e) => sel.has(e.id)).map((e) => ({ id: e.id, patch: { x: e.x + dx, y: e.y + dy } }));
}

/** Aplica patches em um único array novo (referência nova só dos elementos tocados). */
export function applyElPatches(elements: El[], patches: ElPatch[]): El[] {
  const map = new Map(patches.map((p) => [p.id, p.patch]));
  return elements.map((e) => (map.has(e.id) ? ({ ...e, ...map.get(e.id) } as El) : e));
}

// ---------------------------------------------------------------------------
// Camadas
// ---------------------------------------------------------------------------

/** Sobe o grupo uma posição (blocos contíguos andam juntos; ordem relativa preservada). */
export function reorderForward(elements: El[], ids: string[]): El[] {
  const sel = new Set(ids);
  const out = [...elements];
  for (let i = out.length - 2; i >= 0; i--) {
    if (sel.has(out[i].id) && !sel.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
}

/** Desce o grupo uma posição. */
export function reorderBackward(elements: El[], ids: string[]): El[] {
  const sel = new Set(ids);
  const out = [...elements];
  for (let i = 1; i < out.length; i++) {
    if (sel.has(out[i].id) && !sel.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Duplicar
// ---------------------------------------------------------------------------

export type DuplicateBlock = 'noImageSlots' | 'onlyLogo' | null;

export interface DuplicateResult {
  elements: El[];
  /** Ids das cópias (para selecioná-las). */
  copyIds: string[];
  /** Logo estava na seleção e foi ignorada (só cabe uma por post). */
  skippedLogo: boolean;
  blocked: DuplicateBlock;
}

/**
 * Duplica o conjunto como bloco (+offset), logo acima do elemento mais alto
 * selecionado, preservando a ordem relativa. A logo é ignorada (limite de 1) e
 * imagens são tudo-ou-nada contra o limite de 5.
 */
export function duplicateGroup(elements: El[], ids: string[], newId: () => string, offset = 32): DuplicateResult {
  const sel = new Set(ids);
  const originals = elements.filter((e) => sel.has(e.id));
  const skippedLogo = originals.some((e) => e.kind === 'logo');
  const dupable = originals.filter((e) => e.kind !== 'logo');
  const none = (blocked: DuplicateBlock): DuplicateResult => ({ elements, copyIds: [], skippedLogo, blocked });
  if (dupable.length === 0) return none(originals.length > 0 ? 'onlyLogo' : null);
  const imagesNeeded = dupable.filter((e) => e.kind === 'image').length;
  if (imagesNeeded > 0 && countImages(elements) + imagesNeeded > IMAGE_MAX_COUNT) return none('noImageSlots');

  const copies = dupable.map((e) => ({ ...e, id: newId(), x: e.x + offset, y: e.y + offset }) as El);
  const topIndex = Math.max(...dupable.map((e) => elements.findIndex((x) => x.id === e.id)));
  const out = [...elements.slice(0, topIndex + 1), ...copies, ...elements.slice(topIndex + 1)];
  return { elements: out, copyIds: copies.map((c) => c.id), skippedLogo, blocked: null };
}

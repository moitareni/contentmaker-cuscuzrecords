import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { debouncedLocalStorage } from '../lib/storage';
import { temporal } from 'zundo';
import {
  BORDER_TEXTURE_OPACITY_DEFAULT,
  BORDER_TEXTURE_OPACITY_MAX,
  BORDER_TEXTURE_OPACITY_MIN,
  DECORATION_ANCHORS,
  FINISH_ENABLED_DEFAULT,
  GRAIN_INTENSITY_MAX,
  GRAIN_INTENSITY_MIN,
  GRAIN_INTENSITY_DEFAULT,
  GRAIN_SIZE_DEFAULT,
  GRAIN_SIZES,
  GUIDE_MARGIN_DEFAULT,
  GUIDE_MARGIN_MAX,
  GUIDE_MARGIN_MIN,
  LOGO_MARGIN,
  LOGO_SIZES,
  PAPER_OPACITY_DEFAULT,
  PAPER_OPACITY_MAX,
  PAPER_OPACITY_MIN,
  POST_H,
  POST_W,
  TEXT_PRESETS,
  getPostDimensions,
  type LogoSize,
  type PostFormat,
  type TextStyle,
} from '../brand/brand';
import { getBackground, getDecoration, getLogo } from '../assets';
import { clampTextSize } from '../lib/textRules';
import { clampZoom } from '../lib/zoom';
import { clampImageCenter, hasImageSlots, initialImageScale, isPersistedImage } from '../lib/imageRules';
import {
  applyElPatches,
  duplicateGroup,
  pruneIds,
  reorderBackward,
  reorderForward,
  toggleId,
  type ElPatch,
} from '../lib/multiSelect';
import {
  STEP_OF_KIND,
  type BorderTextureFinish,
  type Doc,
  type El,
  type FinishState,
  type GrainFinish,
  type ImageEl,
  type ImageMeta,
  type LogoEl,
  type PaperFinish,
  type StepId,
  type TextEl,
} from '../types';

/** Metadados de uma imagem importada (o blob vive no userImages/IndexedDB). */
export type { ImageMeta };

export interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  message: string;
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type LogoPlace = Corner | 'tc' | 'bc' | 'center';

/** Guias de layout (Photoshop-like). Visibilidade fora do doc: nunca persiste nem entra no undo. */
export interface LayoutGuides {
  visible: boolean;
  showMargins: boolean;
  showCenters: boolean;
  showThirds: boolean;
  margin: number;
}

const clampInt = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v)));

export const defaultFinish = (): FinishState => ({
  paper: { enabled: FINISH_ENABLED_DEFAULT, opacity: PAPER_OPACITY_DEFAULT },
  grain: { enabled: FINISH_ENABLED_DEFAULT, intensity: GRAIN_INTENSITY_DEFAULT, size: GRAIN_SIZE_DEFAULT },
  borderTexture: { enabled: FINISH_ENABLED_DEFAULT, opacity: BORDER_TEXTURE_OPACITY_DEFAULT },
});

/** Valida o acabamento restaurado (rascunho antigo ou corrompido). */
export function sanitizeFinish(f: FinishState | undefined): FinishState {
  const d = defaultFinish();
  if (!f) return d;
  return {
    paper: {
      enabled: f.paper?.enabled === true,
      opacity: typeof f.paper?.opacity === 'number' ? clampInt(f.paper.opacity, PAPER_OPACITY_MIN, PAPER_OPACITY_MAX) : d.paper.opacity,
    },
    grain: {
      enabled: f.grain?.enabled === true,
      intensity: typeof f.grain?.intensity === 'number' ? clampInt(f.grain.intensity, GRAIN_INTENSITY_MIN, GRAIN_INTENSITY_MAX) : d.grain.intensity,
      size: f.grain?.size && f.grain.size in GRAIN_SIZES ? f.grain.size : d.grain.size,
    },
    borderTexture: {
      enabled: f.borderTexture?.enabled === true,
      opacity:
        typeof f.borderTexture?.opacity === 'number'
          ? clampInt(f.borderTexture.opacity, BORDER_TEXTURE_OPACITY_MIN, BORDER_TEXTURE_OPACITY_MAX)
          : d.borderTexture.opacity,
    },
  };
}

export interface EditorState {
  doc: Doc;
  /**
   * Seleção (ordem de seleção). Fonte da verdade da seleção múltipla.
   * Sessão: nunca persiste nem entra no undo.
   */
  selectedIds: string[];
  /** DERIVADO de `selectedIds`: o id quando há exatamente 1 selecionado, senão null. */
  selectedId: string | null;
  editingId: string | null;
  step: StepId;
  guides: { v: boolean; h: boolean };
  toast: Toast | null;
  layoutGuides: LayoutGuides;
  /** Acabamento (passo 6). Persiste e entra no undo junto com o doc. */
  finish: FinishState;
  /** Zoom da folha (multiplicador sobre o ajuste à tela). Sessão: nunca persiste nem entra no undo. */
  zoom: number;
  /** Largura de ajuste à tela em px (base do zoom). Sessão. */
  fitWidth: number;

  setStep: (step: StepId) => void;
  select: (id: string | null) => void;
  /** Ctrl/Cmd/Shift+clique: soma ou remove da seleção (troca o passo só ao restar 1). */
  toggleSelect: (id: string) => void;
  /** Seleciona vários de uma vez (ignora ids que não existem). */
  selectMany: (ids: string[]) => void;
  setEditing: (id: string | null) => void;
  setGuides: (g: { v: boolean; h: boolean }) => void;
  showToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: () => void;
  toggleGuidesVisible: () => void;
  setGuideLayer: (patch: Partial<Omit<LayoutGuides, 'margin' | 'visible'>>) => void;
  setGuideMargin: (margin: number) => void;
  setGuidesVisible: (visible: boolean) => void;
  setPaper: (patch: Partial<PaperFinish>) => void;
  setGrain: (patch: Partial<GrainFinish>) => void;
  setBorderTexture: (patch: Partial<BorderTextureFinish>) => void;
  /** Volta ao acabamento padrão (papel, granulado e textura de borda desligados). */
  resetFinish: () => void;
  /** Define o zoom prendendo nos limites 25%–400%. */
  setZoom: (factor: number) => void;
  setFitWidth: (width: number) => void;

  setFormat: (format: PostFormat) => void;
  setBackgroundOffsetY: (offsetY: number) => void;
  setBackground: (id: string) => void;
  toggleBackgroundFlipX: () => void;
  toggleBackgroundFlipY: () => void;
  addDecoration: (assetId: string) => void;
  addText: (style: TextStyle) => void;
  addLogo: (variant: LogoEl['variant']) => void;
  /** Adiciona imagem do usuário (limite de 5). `at` = centro do drop na folha. */
  addImage: (meta: ImageMeta, at?: { x: number; y: number }) => void;
  /** Troca a fonte da imagem mantendo posição, rotação, flips e largura visual.
   *  `restore` guarda a imagem anterior p/ o botão "Reverter fundo"; omitir limpa. */
  replaceImage: (id: string, meta: ImageMeta, restore?: ImageMeta) => void;
  /** Remove elementos de imagem cujo blob não existe mais (após hidratar o IndexedDB). */
  reconcileImages: (availableIds: Set<string>) => void;
  setLogoSize: (size: LogoSize) => void;
  placeLogo: (place: LogoPlace) => void;
  placeDecoration: (id: string, corner: Corner) => void;

  updateElement: (id: string, patch: Partial<El>) => void;
  /** Aplica a regra Texto ≤ Título. Retorna o tamanho efetivamente aplicado. */
  setTextSize: (id: string, requested: number) => number;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  /** Aplica vários patches num ÚNICO set do doc (um passo de undo). Sem validação de texto: use `buildTransformPatches`. */
  applyPatches: (patches: ElPatch[]) => void;
  removeElements: (ids: string[]) => void;
  /** Duplica o conjunto como bloco e seleciona as cópias (logo ignorada; imagens tudo-ou-nada). */
  duplicateElements: (ids: string[]) => void;
  bringForwardMany: (ids: string[]) => void;
  sendBackwardMany: (ids: string[]) => void;
  reset: () => void;
}

/** Estado de seleção coerente: `selectedId` é sempre derivado de `selectedIds`. */
const selection = (ids: string[]) => ({
  selectedIds: ids,
  selectedId: ids.length === 1 ? ids[0] : null,
});

export const emptyDoc = (): Doc => ({
  format: '3:4',
  backgroundId: null,
  backgroundFlipX: false,
  backgroundFlipY: false,
  backgroundOffsetY: 180,
  elements: [],
});
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Evita empilhar elementos novos exatamente no mesmo ponto. */
function freeCenter(elements: El[], x = POST_W / 2, y = POST_H / 2) {
  let cx = x;
  let cy = y;
  while (elements.some((e) => Math.abs(e.x - cx) < 1 && Math.abs(e.y - cy) < 1)) {
    cx += 32;
    cy += 32;
  }
  return { x: cx, y: cy };
}

function logoPlacement(el: LogoEl, place: LogoPlace, format: PostFormat = '3:4') {
  const { width: postW, height: postH } = getPostDimensions(format);
  const asset = getLogo(el.variant);
  const w = asset.width * el.scale;
  const h = asset.height * el.scale;
  const m = LOGO_MARGIN;
  const left = m + w / 2;
  const right = postW - m - w / 2;
  const top = m + h / 2;
  const bottom = postH - m - h / 2;
  const map: Record<LogoPlace, { x: number; y: number }> = {
    tl: { x: left, y: top },
    tr: { x: right, y: top },
    bl: { x: left, y: bottom },
    br: { x: right, y: bottom },
    tc: { x: postW / 2, y: top },
    bc: { x: postW / 2, y: bottom },
    center: { x: postW / 2, y: postH / 2 },
  };
  return { ...map[place], rotation: 0 };
}

/** Remove referências a assets que não existem mais (ex.: asset apagado da pasta). */
export function sanitize(doc: Doc | undefined): Doc {
  if (!doc) return emptyDoc();
  const validFormats: PostFormat[] = ['3:4', '4:3', '1:1'];
  const format: PostFormat = validFormats.includes(doc.format as PostFormat) ? (doc.format as PostFormat) : '3:4';
  const backgroundOffsetY = typeof doc.backgroundOffsetY === 'number' && Number.isFinite(doc.backgroundOffsetY)
    ? Math.min(360, Math.max(0, Math.round(doc.backgroundOffsetY)))
    : 180;
  return {
    format,
    backgroundId: getBackground(doc.backgroundId) ? doc.backgroundId : null,
    backgroundFlipX: Boolean(doc.backgroundFlipX),
    backgroundFlipY: Boolean(doc.backgroundFlipY),
    backgroundOffsetY,
    elements: (doc.elements ?? []).filter(
      (e) =>
        // Enfeite só fica se o asset do manifest existir.
        (e.kind !== 'decoration' || getDecoration(e.assetId)) &&
        // Imagem do usuário só fica com metadados completos (o blob vem do IndexedDB).
        (e.kind !== 'image' || isPersistedImage(e)),
    ),
  };
}



export const useEditor = create<EditorState>()(
  temporal(
    persist(
      (set, get) => {
        const setDoc = (fn: (doc: Doc) => Doc) => set((s) => ({ doc: fn(s.doc) }));
        const mapEl = (id: string, fn: (e: El) => El) =>
          setDoc((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? fn(e) : e)) }));
        const findEl = (id: string) => get().doc.elements.find((e) => e.id === id);

        return {
          doc: emptyDoc(),
          ...selection([]),
          editingId: null,
          step: 0,
          guides: { v: false, h: false },
          toast: null,
          layoutGuides: {
            visible: true,
            showMargins: true,
            showCenters: false,
            showThirds: false,
            margin: GUIDE_MARGIN_DEFAULT,
          },
          finish: defaultFinish(),
          zoom: 1,
          fitWidth: 360,

          setStep: (step) =>
            set((s) => {
              const sel = s.doc.elements.find((e) => e.id === s.selectedId);
              const keep = sel && STEP_OF_KIND[sel.kind] === step;
              return { step, ...selection(keep && sel ? [sel.id] : []), editingId: null };
            }),
          select: (id) =>
            set((s) => {
              if (!id) return selection([]);
              const el = s.doc.elements.find((e) => e.id === id);
              return el ? { ...selection([id]), step: STEP_OF_KIND[el.kind] } : {};
            }),
          toggleSelect: (id) =>
            set((s) => {
              if (!s.doc.elements.some((e) => e.id === id)) return {};
              const next = toggleId(s.selectedIds, id);
              // Restou 1: o painel lateral acompanha o tipo dele (invariante passo × seleção única).
              const only = next.length === 1 ? s.doc.elements.find((e) => e.id === next[0]) : undefined;
              return only ? { ...selection(next), step: STEP_OF_KIND[only.kind] } : selection(next);
            }),
          selectMany: (ids) =>
            set((s) => {
              const next = pruneIds(ids, s.doc.elements);
              const only = next.length === 1 ? s.doc.elements.find((e) => e.id === next[0]) : undefined;
              return only ? { ...selection(next), step: STEP_OF_KIND[only.kind] } : selection(next);
            }),
          setEditing: (id) => set({ editingId: id }),
          setGuides: (g) => {
            const cur = get().guides;
            if (cur.v !== g.v || cur.h !== g.h) set({ guides: g });
          },
          showToast: (kind, message) => set({ toast: { id: Date.now() + Math.random(), kind, message } }),
          dismissToast: () => set({ toast: null }),
          toggleGuidesVisible: () =>
            set((s) => ({ layoutGuides: { ...s.layoutGuides, visible: !s.layoutGuides.visible } })),
          setGuideLayer: (patch) => set((s) => ({ layoutGuides: { ...s.layoutGuides, ...patch } })),
          setGuideMargin: (margin) =>
            set((s) => ({
              layoutGuides: {
                ...s.layoutGuides,
                margin: Math.min(GUIDE_MARGIN_MAX, Math.max(GUIDE_MARGIN_MIN, Math.round(margin))),
              },
            })),
          setGuidesVisible: (visible) => set((s) => ({ layoutGuides: { ...s.layoutGuides, visible } })),
          resetFinish: () => set({ finish: defaultFinish() }),
          setZoom: (factor) => {
            const next = clampZoom(factor);
            if (get().zoom !== next) set({ zoom: next });
          },
          setFitWidth: (width) => {
            const next = Math.max(1, Math.round(width));
            if (get().fitWidth !== next) set({ fitWidth: next });
          },
          setPaper: (patch) =>
            set((s) => ({
              finish: {
                ...s.finish,
                paper: {
                  enabled: patch.enabled ?? s.finish.paper.enabled,
                  opacity:
                    patch.opacity === undefined
                      ? s.finish.paper.opacity
                      : clampInt(patch.opacity, PAPER_OPACITY_MIN, PAPER_OPACITY_MAX),
                },
              },
            })),
          setGrain: (patch) =>
            set((s) => ({
              finish: {
                ...s.finish,
                grain: {
                  enabled: patch.enabled ?? s.finish.grain.enabled,
                  intensity:
                    patch.intensity === undefined
                      ? s.finish.grain.intensity
                      : clampInt(patch.intensity, GRAIN_INTENSITY_MIN, GRAIN_INTENSITY_MAX),
                  size: patch.size && patch.size in GRAIN_SIZES ? patch.size : s.finish.grain.size,
                },
              },
            })),
          setBorderTexture: (patch) =>
            set((s) => ({
              finish: {
                ...s.finish,
                borderTexture: {
                  enabled: patch.enabled ?? s.finish.borderTexture.enabled,
                  opacity:
                    patch.opacity === undefined
                      ? s.finish.borderTexture.opacity
                      : clampInt(patch.opacity, BORDER_TEXTURE_OPACITY_MIN, BORDER_TEXTURE_OPACITY_MAX),
                },
              },
            })),

          setFormat: (format) =>
            setDoc((d) => ({
              ...d,
              format,
              backgroundOffsetY: d.backgroundOffsetY ?? 180,
            })),
          setBackgroundOffsetY: (offsetY) => {
            const clamped = Math.min(360, Math.max(0, Math.round(offsetY)));
            setDoc((d) => ({ ...d, backgroundOffsetY: clamped }));
          },
          setBackground: (id) => setDoc((d) => ({ ...d, backgroundId: id })),
          toggleBackgroundFlipX: () =>
            setDoc((d) => ({ ...d, backgroundFlipX: !d.backgroundFlipX })),
          toggleBackgroundFlipY: () =>
            setDoc((d) => ({ ...d, backgroundFlipY: !d.backgroundFlipY })),

          addDecoration: (assetId) => {
            const asset = getDecoration(assetId);
            if (!asset) return;
            const { width: postW, height: postH } = getPostDimensions(get().doc.format);
            const pos = asset.fullSheet
              ? { x: postW / 2, y: postH / 2 }
              : freeCenter(get().doc.elements, postW / 2, postH / 2);
            const el: El = { id: uid(), kind: 'decoration', assetId, ...pos, rotation: 0, scale: 1, flipX: false, flipY: false };
            setDoc((d) => ({ ...d, elements: [...d.elements, el] }));
            set(selection([el.id]));
          },

          addText: (style) => {
            const p = TEXT_PRESETS[style];
            const elements = get().doc.elements;
            const { width: postW, height: postH } = getPostDimensions(get().doc.format);
            const pos = freeCenter(elements, postW / 2, postH / 2);
            const base: TextEl = {
              id: uid(),
              kind: 'text',
              style,
              text: p.placeholder,
              ...pos,
              rotation: 0,
              scale: 1,
              fontSize: p.fontSize,
              lineHeight: p.lineHeight,
              letterSpacing: p.letterSpacing,
              align: 'center',
              uppercase: p.uppercase,
              color: p.color,
              brandEffect: p.brandEffect,
              border: p.border,
            };
            // Nasce já respeitando a regra (sem mostrar erro: o usuário não pediu esse tamanho).
            base.fontSize = clampTextSize(elements, base, p.fontSize).value;
            setDoc((d) => ({ ...d, elements: [...d.elements, base] }));
            set(selection([base.id]));
          },

          addLogo: (variant) => {
            const existing = get().doc.elements.find((e): e is LogoEl => e.kind === 'logo');
            if (existing) {
              // Troca a versão mantendo a largura visual.
              const oldW = getLogo(existing.variant).width * existing.scale;
              const scale = oldW / getLogo(variant).width;
              mapEl(existing.id, (e) => ({ ...(e as LogoEl), variant, scale }));
              set(selection([existing.id]));
              return;
            }
            const scale = LOGO_SIZES.M / getLogo(variant).width;
            const el: LogoEl = { id: uid(), kind: 'logo', variant, x: 0, y: 0, rotation: 0, scale };
            Object.assign(el, logoPlacement(el, 'bc', get().doc.format));
            setDoc((d) => ({ ...d, elements: [...d.elements, el] }));
            set(selection([el.id]));
          },

          setLogoSize: (size) => {
            const logo = get().doc.elements.find((e): e is LogoEl => e.kind === 'logo');
            if (!logo) return;
            mapEl(logo.id, (e) => ({ ...e, scale: LOGO_SIZES[size] / getLogo(logo.variant).width }));
          },

          placeLogo: (place) => {
            const logo = get().doc.elements.find((e): e is LogoEl => e.kind === 'logo');
            if (!logo) return;
            mapEl(logo.id, (e) => ({ ...e, ...logoPlacement(logo, place, get().doc.format) }));
            set(selection([logo.id]));
          },

          addImage: (meta, at) => {
            if (!meta.imageId || !(meta.width > 0) || !(meta.height > 0)) return;
            const elements = get().doc.elements;
            if (!hasImageSlots(elements)) {
              get().showToast('error', 'Tá lotado! Cabem até 5 imagens por post 😅');
              return;
            }
            const { width: postW, height: postH } = getPostDimensions(get().doc.format);
            const pos = at ? clampImageCenter(at.x, at.y, postW, postH) : freeCenter(elements, postW / 2, postH / 2);
            const el: ImageEl = {
              id: uid(),
              kind: 'image',
              imageId: meta.imageId,
              name: meta.name,
              x: pos.x,
              y: pos.y,
              rotation: 0,
              scale: initialImageScale(meta.width, meta.height, 0.7, postW, postH),
              flipX: false,
              flipY: false,
              width: meta.width,
              height: meta.height,
            };
            setDoc((d) => ({ ...d, elements: [...d.elements, el] }));
            set(selection([el.id]));
          },

          replaceImage: (id, meta, restore) => {
            const el = findEl(id);
            if (!el || el.kind !== 'image' || !(meta.width > 0) || !(meta.height > 0)) return;
            const cur = el;
            // Mantém a largura visual da imagem anterior.
            const scale = cur.width > 0 && meta.width > 0 ? (cur.width * cur.scale) / meta.width : cur.scale;
            mapEl(id, (e) => {
              const next: ImageEl = {
                ...(e as ImageEl),
                imageId: meta.imageId,
                name: meta.name,
                width: meta.width,
                height: meta.height,
                scale,
              };
              if (restore) next.cutFrom = restore;
              else delete next.cutFrom;
              return next as El;
            });
          },

          reconcileImages: (availableIds) => {
            const ghosts = get().doc.elements.filter(
              (e): e is ImageEl => e.kind === 'image' && !availableIds.has(e.imageId),
            );
            if (ghosts.length === 0) return;
            const ids = new Set(ghosts.map((g) => g.id));
            setDoc((d) => ({ ...d, elements: d.elements.filter((e) => !ids.has(e.id)) }));
          },

          placeDecoration: (id, corner) => {
            const el = findEl(id);
            if (!el || el.kind !== 'decoration') return;
            const asset = getDecoration(el.assetId)!;
            const anchor = DECORATION_ANCHORS[el.assetId] ?? { h: 'left', v: 'top' };
            const wantH = corner[1] === 'l' ? 'left' : 'right';
            const wantV = corner[0] === 't' ? 'top' : 'bottom';
            const flipX = anchor.h === 'center' ? false : anchor.h !== wantH;
            const flipY = anchor.v !== wantV;
            const { width: postW, height: postH } = getPostDimensions(get().doc.format);
            const w = asset.width * el.scale;
            const h = asset.height * el.scale;
            mapEl(id, (e) => ({
              ...e,
              flipX,
              flipY,
              rotation: 0,
              x: wantH === 'left' ? w / 2 : postW - w / 2,
              y: wantV === 'top' ? h / 2 : postH - h / 2,
            }));
          },

          updateElement: (id, patch) => {
            const el = findEl(id);
            if (!el) return;
            if (el.kind === 'text' && 'fontSize' in patch && typeof patch.fontSize === 'number') {
              const { fontSize, ...rest } = patch as Partial<TextEl>;
              const size = get().setTextSize(id, fontSize!);
              mapEl(id, (e) => ({ ...e, ...rest, fontSize: size }) as El);
              return;
            }
            mapEl(id, (e) => ({ ...e, ...patch }) as El);
          },

          setTextSize: (id, requested) => {
            const el = findEl(id);
            if (!el || el.kind !== 'text') return requested;
            const { value, error } = clampTextSize(get().doc.elements, el, requested);
            if (error) get().showToast('error', error);
            if (value !== el.fontSize || el.scale !== 1) mapEl(id, (e) => ({ ...e, fontSize: value, scale: 1 }));
            return value;
          },

          removeElement: (id) => {
            setDoc((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
            set((s) => ({ ...selection(s.selectedIds.filter((i) => i !== id)), editingId: null }));
          },

          duplicateElement: (id) => {
            const el = findEl(id);
            if (!el) return;
            if (el.kind === 'logo') {
              get().showToast('info', 'Só cabe uma logo por post 😉');
              return;
            }
            if (el.kind === 'image' && !hasImageSlots(get().doc.elements)) {
              get().showToast('error', 'Tá lotado! Cabem até 5 imagens por post 😅');
              return;
            }
            const copy = { ...el, id: uid(), ...freeCenter(get().doc.elements, el.x + 32, el.y + 32) } as El;
            setDoc((d) => {
              const i = d.elements.findIndex((e) => e.id === id);
              const elements = [...d.elements];
              elements.splice(i + 1, 0, copy);
              return { ...d, elements };
            });
            set(selection([copy.id]));
          },

          bringForward: (id) =>
            setDoc((d) => {
              const i = d.elements.findIndex((e) => e.id === id);
              if (i < 0 || i === d.elements.length - 1) return d;
              const elements = [...d.elements];
              [elements[i], elements[i + 1]] = [elements[i + 1], elements[i]];
              return { ...d, elements };
            }),

          sendBackward: (id) =>
            setDoc((d) => {
              const i = d.elements.findIndex((e) => e.id === id);
              if (i <= 0) return d;
              const elements = [...d.elements];
              [elements[i], elements[i - 1]] = [elements[i - 1], elements[i]];
              return { ...d, elements };
            }),

          applyPatches: (patches) => {
            if (patches.length === 0) return;
            setDoc((d) => ({ ...d, elements: applyElPatches(d.elements, patches) }));
          },

          removeElements: (ids) => {
            if (ids.length === 0) return;
            const gone = new Set(ids);
            setDoc((d) => ({ ...d, elements: d.elements.filter((e) => !gone.has(e.id)) }));
            set((s) => ({ ...selection(s.selectedIds.filter((i) => !gone.has(i))), editingId: null }));
          },

          duplicateElements: (ids) => {
            const r = duplicateGroup(get().doc.elements, ids, uid);
            if (r.blocked === 'noImageSlots') {
              get().showToast('error', 'Tá lotado! Cabem até 5 imagens por post 😅');
              return;
            }
            if (r.blocked === 'onlyLogo') {
              get().showToast('info', 'Só cabe uma logo por post 😉');
              return;
            }
            if (r.copyIds.length === 0) return;
            setDoc((d) => ({ ...d, elements: r.elements }));
            const only = r.copyIds.length === 1 ? r.elements.find((e) => e.id === r.copyIds[0]) : undefined;
            set(only ? { ...selection(r.copyIds), step: STEP_OF_KIND[only.kind] } : selection(r.copyIds));
            if (r.skippedLogo) get().showToast('info', 'A logo ficou de fora: só cabe uma por post 😉');
          },

          bringForwardMany: (ids) =>
            setDoc((d) => {
              const elements = reorderForward(d.elements, ids);
              return elements.every((e, i) => e === d.elements[i]) ? d : { ...d, elements };
            }),

          sendBackwardMany: (ids) =>
            setDoc((d) => {
              const elements = reorderBackward(d.elements, ids);
              return elements.every((e, i) => e === d.elements[i]) ? d : { ...d, elements };
            }),

          reset: () => set({ doc: emptyDoc(), finish: defaultFinish(), ...selection([]), editingId: null, step: 0 }),
        };
      },
      {
        name: 'cuscuz-insta-kit:rascunho',
        version: 1,
        storage: createJSONStorage(() => debouncedLocalStorage()),
        partialize: (s) => ({ doc: s.doc, finish: s.finish }),
        merge: (persisted, current) => {
          const p = persisted as { doc?: Doc; finish?: FinishState } | undefined;
          return { ...current, doc: sanitize(p?.doc), finish: sanitizeFinish(p?.finish) };
        },
        onRehydrateStorage: () => () => {
          // O histórico começa depois do rascunho restaurado.
          setTimeout(() => useEditor.temporal.getState().clear(), 0);
        },
      },
    ),
    {
      limit: 50,
      partialize: (s) => ({ doc: s.doc, finish: s.finish }),
      equality: (a, b) => a.doc === b.doc && a.finish === b.finish,
      // Agrupa mudanças contínuas (ex.: arrastar um slider) em um único passo de desfazer.
      handleSet: (handleSet) => {
        let last = 0;
        return ((...args: Parameters<typeof handleSet>) => {
          const now = Date.now();
          if (now - last > 400) handleSet(...args);
          last = now;
        }) as typeof handleSet;
      },
    },
  ),
);

// Undo/redo (ou qualquer troca de doc) pode remover elementos selecionados: poda os ids fantasmas.
useEditor.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  const pruned = pruneIds(s.selectedIds, s.doc.elements);
  if (pruned.length !== s.selectedIds.length) useEditor.setState(selection(pruned));
});

export const useSelected = () => useEditor((s) => s.doc.elements.find((e) => e.id === s.selectedId) ?? null);
/** Elementos selecionados, na ordem das camadas (referência estável enquanto doc/seleção não mudam). */
export const useSelectedElements = () => {
  const elements = useEditor((s) => s.doc.elements);
  const ids = useEditor((s) => s.selectedIds);
  return useMemo(() => elements.filter((e) => ids.includes(e.id)), [elements, ids]);
};
export const undo = () => useEditor.temporal.getState().undo();
export const redo = () => useEditor.temporal.getState().redo();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__useEditor = useEditor;
}

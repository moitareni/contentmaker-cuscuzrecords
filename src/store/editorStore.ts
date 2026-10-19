import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { temporal } from 'zundo';
import {
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
  type LogoSize,
  type TextStyle,
} from '../brand/brand';
import { getBackground, getDecoration, getLogo } from '../assets';
import { clampTextSize } from '../lib/textRules';
import { clampZoom } from '../lib/zoom';
import { STEP_OF_KIND, type Doc, type El, type FinishState, type GrainFinish, type LogoEl, type PaperFinish, type StepId, type TextEl } from '../types';

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

const defaultFinish = (): FinishState => ({
  paper: { enabled: FINISH_ENABLED_DEFAULT, opacity: PAPER_OPACITY_DEFAULT },
  grain: { enabled: FINISH_ENABLED_DEFAULT, intensity: GRAIN_INTENSITY_DEFAULT, size: GRAIN_SIZE_DEFAULT },
});

/** Valida o acabamento restaurado (rascunho antigo ou corrompido). */
function sanitizeFinish(f: FinishState | undefined): FinishState {
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
  };
}

export interface EditorState {
  doc: Doc;
  selectedId: string | null;
  editingId: string | null;
  step: StepId;
  guides: { v: boolean; h: boolean };
  toast: Toast | null;
  layoutGuides: LayoutGuides;
  /** Acabamento (passo 5). Persiste e entra no undo junto com o doc. */
  finish: FinishState;
  /** Zoom da folha (multiplicador sobre o ajuste à tela). Sessão: nunca persiste nem entra no undo. */
  zoom: number;
  /** Largura de ajuste à tela em px (base do zoom). Sessão. */
  fitWidth: number;

  setStep: (step: StepId) => void;
  select: (id: string | null) => void;
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
  /** Volta ao acabamento padrão (papel e granulado desligados). */
  resetFinish: () => void;
  /** Define o zoom prendendo nos limites 25%–400%. */
  setZoom: (factor: number) => void;
  setFitWidth: (width: number) => void;

  setBackground: (id: string) => void;
  addDecoration: (assetId: string) => void;
  addText: (style: TextStyle) => void;
  addLogo: (variant: LogoEl['variant']) => void;
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
  reset: () => void;
}

const emptyDoc = (): Doc => ({ backgroundId: null, elements: [] });
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

function logoPlacement(el: LogoEl, place: LogoPlace) {
  const asset = getLogo(el.variant);
  const w = asset.width * el.scale;
  const h = asset.height * el.scale;
  const m = LOGO_MARGIN;
  const left = m + w / 2;
  const right = POST_W - m - w / 2;
  const top = m + h / 2;
  const bottom = POST_H - m - h / 2;
  const map: Record<LogoPlace, { x: number; y: number }> = {
    tl: { x: left, y: top },
    tr: { x: right, y: top },
    bl: { x: left, y: bottom },
    br: { x: right, y: bottom },
    tc: { x: POST_W / 2, y: top },
    bc: { x: POST_W / 2, y: bottom },
    center: { x: POST_W / 2, y: POST_H / 2 },
  };
  return { ...map[place], rotation: 0 };
}

/** Grava o rascunho com debounce e garante a gravação ao fechar a aba. */
function debouncedLocalStorage(delay = 300): StateStorage {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: [string, string] | null = null;
  const flush = () => {
    if (pending) localStorage.setItem(pending[0], pending[1]);
    pending = null;
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => {
      pending = [k, v];
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (k) => localStorage.removeItem(k),
  };
}

/** Remove referências a assets que não existem mais (ex.: asset apagado da pasta). */
function sanitize(doc: Doc | undefined): Doc {
  if (!doc) return emptyDoc();
  return {
    backgroundId: getBackground(doc.backgroundId) ? doc.backgroundId : null,
    elements: (doc.elements ?? []).filter((e) => e.kind !== 'decoration' || getDecoration(e.assetId)),
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
          selectedId: null,
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
              return { step, selectedId: keep ? s.selectedId : null, editingId: null };
            }),
          select: (id) =>
            set((s) => {
              if (!id) return { selectedId: null };
              const el = s.doc.elements.find((e) => e.id === id);
              return el ? { selectedId: id, step: STEP_OF_KIND[el.kind] } : {};
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

          setBackground: (id) => setDoc((d) => ({ ...d, backgroundId: id })),

          addDecoration: (assetId) => {
            if (!getDecoration(assetId)) return;
            const pos = freeCenter(get().doc.elements);
            const el: El = { id: uid(), kind: 'decoration', assetId, ...pos, rotation: 0, scale: 1, flipX: false, flipY: false };
            setDoc((d) => ({ ...d, elements: [...d.elements, el] }));
            set({ selectedId: el.id });
          },

          addText: (style) => {
            const p = TEXT_PRESETS[style];
            const elements = get().doc.elements;
            const pos = freeCenter(elements);
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
            set({ selectedId: base.id });
          },

          addLogo: (variant) => {
            const existing = get().doc.elements.find((e): e is LogoEl => e.kind === 'logo');
            if (existing) {
              // Troca a versão mantendo a largura visual.
              const oldW = getLogo(existing.variant).width * existing.scale;
              const scale = oldW / getLogo(variant).width;
              mapEl(existing.id, (e) => ({ ...(e as LogoEl), variant, scale }));
              set({ selectedId: existing.id });
              return;
            }
            const scale = LOGO_SIZES.M / getLogo(variant).width;
            const el: LogoEl = { id: uid(), kind: 'logo', variant, x: 0, y: 0, rotation: 0, scale };
            Object.assign(el, logoPlacement(el, 'bc'));
            setDoc((d) => ({ ...d, elements: [...d.elements, el] }));
            set({ selectedId: el.id });
          },

          setLogoSize: (size) => {
            const logo = get().doc.elements.find((e): e is LogoEl => e.kind === 'logo');
            if (!logo) return;
            mapEl(logo.id, (e) => ({ ...e, scale: LOGO_SIZES[size] / getLogo(logo.variant).width }));
          },

          placeLogo: (place) => {
            const logo = get().doc.elements.find((e): e is LogoEl => e.kind === 'logo');
            if (!logo) return;
            mapEl(logo.id, (e) => ({ ...e, ...logoPlacement(logo, place) }));
            set({ selectedId: logo.id });
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
            const w = asset.width * el.scale;
            const h = asset.height * el.scale;
            mapEl(id, (e) => ({
              ...e,
              flipX,
              flipY,
              rotation: 0,
              x: wantH === 'left' ? w / 2 : POST_W - w / 2,
              y: wantV === 'top' ? h / 2 : POST_H - h / 2,
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
            set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId, editingId: null }));
          },

          duplicateElement: (id) => {
            const el = findEl(id);
            if (!el) return;
            if (el.kind === 'logo') {
              get().showToast('info', 'Só cabe uma logo por post 😉');
              return;
            }
            const copy = { ...el, id: uid(), ...freeCenter(get().doc.elements, el.x + 32, el.y + 32) } as El;
            setDoc((d) => {
              const i = d.elements.findIndex((e) => e.id === id);
              const elements = [...d.elements];
              elements.splice(i + 1, 0, copy);
              return { ...d, elements };
            });
            set({ selectedId: copy.id });
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

          reset: () => set({ doc: emptyDoc(), finish: defaultFinish(), selectedId: null, editingId: null, step: 0 }),
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

export const useSelected = () => useEditor((s) => s.doc.elements.find((e) => e.id === s.selectedId) ?? null);
export const undo = () => useEditor.temporal.getState().undo();
export const redo = () => useEditor.temporal.getState().redo();

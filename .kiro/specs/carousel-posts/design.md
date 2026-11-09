# Design Técnico — Carrossel de Posts para Instagram

## Visão Geral

O Modo Carrossel é adicionado ao Cuscuz Records Insta Kit como uma camada **orquestadora** que envolve o editor existente. O editor de 6 etapas (`useEditor` + `EditorCanvas`) não é refatorado; em vez disso, o novo `useCarousel` assume o papel de gerenciar a lista de slides e sincronizar o slide ativo com o editor. O Modo Post Único continua funcionando exatamente como antes, sem nenhuma alteração.

---

## Diagrama de Fluxo de Dados

```
┌────────────────────────────────────────────────────────────────┐
│                        App.tsx                                 │
│  mode==='single' → layout atual (sem alteração)                │
│  mode==='carousel' → layout atual + <SlideTray />              │
└──────────┬────────────────────────────────┬───────────────────┘
           │                                │
           ▼                                ▼
┌─────────────────────┐          ┌──────────────────────────┐
│   useCarousel       │          │   useEditor              │
│   (carouselStore)   │◄────────►│   (editorStore / zundo)  │
│                     │  sync    │                          │
│  slides[]           │  ──────► │  doc  (slide ativo)      │
│  activeSlideIndex   │  ◄────── │  finish (slide ativo)    │
│  format             │  write   │                          │
│  mode               │          │  selectedIds             │
│  isExporting        │          │  step                    │
└──────────┬──────────┘          └──────────┬───────────────┘
           │                                │
           │ lê/escreve                     │ lê
           ▼                                ▼
┌──────────────────────┐         ┌──────────────────────────┐
│  localStorage        │         │  EditorCanvas (Konva)    │
│  cuscuz-insta-kit:   │         │  Stage → stageRef        │
│  carrossel           │         │  (reutilizado por todos  │
│  { slides,           │         │   os slides e na export) │
│    activeSlideIndex, │         └──────────┬───────────────┘
│    format }          │                    │
└──────────────────────┘                    │ stage.toDataURL()
                                            ▼
                          ┌────────────────────────────────┐
                          │  useSlideThumb (hook)          │
                          │  debounce 400ms → miniatura    │
                          │  Map<slideId, dataUrl> (mem.)  │
                          └────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Exportação do Carrossel                                     │
│                                                              │
│  exportCarousel()                                            │
│    for each slide:                                           │
│      1. carouselStore.setActiveSlide(i)                      │
│         └─→ useEditor.setState({ doc, finish })              │
│      2. await 80ms (re-render Konva)                         │
│      3. ensureFontsLoaded() + ensureUserImagesReady()        │
│      4. stage.toDataURL() → PNG blob                         │
│      5. zip.file(`slide-NN.png`, blob)                       │
│    zip.generateAsync() → download                            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  IndexedDB (cuscuz-insta-kit / store: images)                │
│                                                              │
│  Boot em Modo Carrossel:                                     │
│    hydrateUserImages()                                       │
│    → allIds = union de imageId + cutFrom.imageId             │
│       de TODOS os slides                                     │
│    → reconcileImages(availableIds) por slide                 │
│    → collectGarbageImages(allIds)                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Novos Tipos de Dados

### 1.1 `SlideData` (acrescentar em `src/types.ts`)

```typescript
/** Uma unidade do carrossel: doc + acabamento + id único. */
export interface SlideData {
  /** Identificador único do slide (gerado na criação, imutável). */
  id: string;
  /** Estado do documento (elementos, fundo, formato). */
  doc: Doc;
  /** Acabamentos (papel, granulado, textura de borda). */
  finish: FinishState;
}
```

### 1.2 Constantes de carrossel (acrescentar em `src/brand/brand.ts`)

```typescript
/** Número máximo de slides por carrossel. */
export const CAROUSEL_MAX_SLIDES = 10;

/** Largura alvo (px) de cada miniatura de slide na Tira de Miniaturas. */
export const CAROUSEL_THUMB_WIDTH = 270;

/** Debounce (ms) para regeneração de miniatura após edição. */
export const CAROUSEL_THUMB_DEBOUNCE = 400;
```

---

## 2. `useCarousel` — Novo Store Zustand (`src/store/carouselStore.ts`)

O store gerencia o estado do carrossel e é responsável pela sincronização com `useEditor`.

### 2.1 Interface

```typescript
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Doc, FinishState } from '../types';
import type { PostFormat } from '../brand/brand';
import type { SlideData } from '../types';

export type CarouselMode = 'single' | 'carousel' | null;

interface CarouselState {
  // ── Dados persistidos no localStorage ───────────────────────
  slides: SlideData[];
  activeSlideIndex: number;
  format: PostFormat;
  mode: CarouselMode;

  // ── Estado de sessão (não persiste) ─────────────────────────
  isExporting: boolean;
  exportProgress: { current: number; total: number } | null;

  // ── Actions ─────────────────────────────────────────────────
  setMode: (mode: CarouselMode) => void;
  setFormat: (format: PostFormat) => void;
  addSlide: () => void;
  duplicateSlide: (index: number) => void;
  removeSlide: (index: number) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;
  setActiveSlide: (index: number) => void;
  /** Chamado pelo subscriber do useEditor para gravar as mudanças do slide ativo. */
  updateActiveSlide: (doc: Doc, finish: FinishState) => void;
  setExporting: (progress: { current: number; total: number } | null) => void;
  resetCarousel: () => void;
}
```

**Persistência:**
- Chave: `'cuscuz-insta-kit:carrossel'`
- Campos persistidos: `{ slides, activeSlideIndex, format, mode }`
- Storage: `debouncedLocalStorage(300)` (mesma fábrica do `editorStore.ts`, extraída para `src/lib/storage.ts`)
- `isExporting` e `exportProgress` **não** persistem (estado de sessão)

### 2.2 Sincronização com `useEditor`

A sincronização é feita por **dois pontos de integração**:

**A — Carregar slide ativo no editor (carouselStore → useEditor):**

Chamado em `setActiveSlide` e em `setMode('carousel')`:
```typescript
import { useEditor } from './editorStore';

function loadSlideIntoEditor(slide: SlideData) {
  // 1. Carrega doc e finish do slide
  useEditor.setState({ doc: slide.doc, finish: slide.finish });
  // 2. Reseta passo para 0 e limpa seleção
  useEditor.setState({ step: 0, selectedIds: [], selectedId: null, editingId: null });
  // 3. Limpa o histórico temporal — cada slide tem histórico isolado
  useEditor.temporal.getState().clear();
}
```

**B — Gravar alterações do editor de volta no slide ativo (useEditor → carouselStore):**

Subscriber montado em `main.tsx` (ou num `useEffect` raiz que roda uma vez):
```typescript
useEditor.subscribe((s, prev) => {
  // Apenas em modo carrossel e apenas quando doc ou finish mudam
  const carousel = useCarousel.getState();
  if (carousel.mode !== 'carousel') return;
  if (s.doc === prev.doc && s.finish === prev.finish) return;
  carousel.updateActiveSlide(s.doc, s.finish);
});
```

**`updateActiveSlide`** só grava quando os dados realmente mudaram (comparação por referência), evitando loops:
```typescript
updateActiveSlide: (doc, finish) =>
  set((s) => {
    const slide = s.slides[s.activeSlideIndex];
    if (!slide || (slide.doc === doc && slide.finish === finish)) return s;
    const slides = [...s.slides];
    slides[s.activeSlideIndex] = { ...slide, doc, finish };
    return { slides };
  }),
```

---

## 3. Gerenciamento de Modo (`src/components/ModeSelector.tsx`)

### 3.1 Lógica de boot

```typescript
// Em main.tsx, antes de renderizar:
async function bootstrap() {
  // 1. Hidratar imagens do IndexedDB
  const availableIds = await hydrateUserImages();

  const carouselState = useCarousel.getState();

  if (carouselState.mode === 'carousel') {
    // Reconcilia imagens de todos os slides
    const allImageIds = collectAllImageIds(carouselState.slides);
    reconcileAllSlides(carouselState.slides, availableIds);
    await collectGarbageImages(allImageIds);
    // Limpa histórico temporal ao restaurar
    useEditor.temporal.getState().clear();
  } else if (carouselState.mode === 'single') {
    // Modo Post Único: reconciliação já feita pelo onRehydrateStorage do editorStore
    const singleIds = collectDocImageIds(useEditor.getState().doc);
    await collectGarbageImages(singleIds);
  }
  // mode === null → ModeSelector será exibido
}
```

### 3.2 Componente `ModeSelector`

Exibido quando `mode === null`. Apresenta:
- Botão **"Post único"** → `setMode('single')`
- Botão **"Carrossel"** → abre seletor de formato → `setFormat(f)` → `setMode('carousel')` → `addSlide()`

Se já há dados salvos (`mode !== null`), o `ModeSelector` não é exibido — o App restaura o modo diretamente.

**Troca de modo: Single → Carrossel**
- Nenhuma confirmação é exibida.
- O `doc` e `finish` atuais do `useEditor` são lidos e usados para criar o primeiro `SlideData`:
  ```typescript
  const { doc, finish } = useEditor.getState();
  const firstSlide: SlideData = { id: uid(), doc, finish };
  useCarousel.setState({ slides: [firstSlide], activeSlideIndex: 0, format: doc.format ?? '3:4' });
  setMode('carousel');
  loadSlideIntoEditor(firstSlide);
  // Limpa a chave do rascunho do post único
  localStorage.removeItem('cuscuz-insta-kit:rascunho');
  ```
- O formato do carrossel é herdado do `doc.format` do post único.

**Troca de modo: Carrossel → Single**
- Exibe o novo componente `<SlidePickerDialog>` (a criar em `src/components/carousel/SlidePickerDialog.tsx`):
  - Lista todos os slides com suas miniaturas (geradas pelo `thumbCache` do `useSlideThumb`)
  - Botão de rádio/clique para selecionar um slide
  - Opção "Começar do zero"
  - Botões "Confirmar" e "Cancelar"
- Se confirmado com slide selecionado:
  ```typescript
  const chosen = slides[selectedIndex];
  useEditor.setState({ doc: chosen.doc, finish: chosen.finish });
  useEditor.temporal.getState().clear();
  resetCarousel(); // limpa slides e reseta mode para null
  setMode('single');
  localStorage.removeItem('cuscuz-insta-kit:carrossel');
  ```
- Se confirmado com "Começar do zero":
  ```typescript
  useEditor.getState().reset();
  resetCarousel();
  setMode('single');
  localStorage.removeItem('cuscuz-insta-kit:carrossel');
  ```
- Se cancelado: fecha o diálogo sem alterar nada.

---

## 4. Layout em Modo Carrossel (`src/App.tsx`)

```typescript
// App.tsx — branch de modo
const mode = useCarousel((s) => s.mode);

// Em modo carrossel, o layout recebe a SlideTray abaixo do canvasArea
{mode === 'carousel' && (
  <React.Suspense fallback={null}>
    <SlideTray stageRef={canvasRef} />
  </React.Suspense>
)}
```

O `App.tsx` importa `SlideTray` e `ModeSelector` com `React.lazy` para code splitting.

---

## 5. Tira de Miniaturas (`src/components/carousel/SlideTray.tsx`)

### 5.1 Estrutura

```
┌──────────────────────────────────────────────────────────────────┐
│ [◄]  [Slide 1 🗑][Slide 2* 🗑][Slide 3 🗑]  [+]  [►]            │
│      └─ lixeira sobreposta no canto superior direito de cada um  │
│                                                                  │
│ Barra de controles:                                              │
│ [Duplicar slide ativo]   (botões prev/next no próprio carrossel) │
└──────────────────────────────────────────────────────────────────┘
```

- `*` indica slide ativo (destaque visual: borda `3px solid #f8ce2b` e sombra sólida)
- Badge ordinal sobreposto no canto superior esquerdo de cada miniatura

### 5.1.1 Botão "+" ao lado do último slide

O botão `+` é renderizado como um `SlideThumb` especial — o último item da lista horizontal — com aparência de botão adesivo compacto (mesma estética `caderninho nordestino`: borda 3px, sombra sólida `0 4px 0 #0b0500`). Ao clicar, chama `addSlide()` do carouselStore.

Quando o limite `CAROUSEL_MAX_SLIDES` é atingido, o botão `+` fica `disabled` e recebe opacidade reduzida — o Toast de limite é disparado ao tentar clicar.

### 5.1.2 Lixeira sobreposta em cada SlideThumb

Cada `SlideThumb` renderiza um `IconButton` com ícone de lixeira (`Trash2` do Lucide, tamanho 12px) posicionado em `position: absolute; top: 4px; right: 4px` sobre a miniatura. É sempre visível (não depende de hover) para funcionar em dispositivos touch.

Ao clicar:
- Se `isSlideEmpty(slide)` → chama `removeSlide(index)` diretamente
- Caso contrário → abre o `<ConfirmDialog>` existente com mensagem: `"Apagar este slide? O conteúdo vai embora 🗑️"`

O botão de lixeira do slide que tem apenas 1 slide no carrossel fica `disabled` (o Toast "o carrossel precisa de pelo menos 1 slide" é mostrado ao tentar clicar).

### 5.2 Drag-and-drop de reordenação

Usa a HTML5 Drag-and-drop API nativa (sem biblioteca extra):

```typescript
// Em SlideThumb.tsx:
const handleDragStart = (e: React.DragEvent) => {
  e.dataTransfer.setData('text/plain', String(index));
  e.dataTransfer.effectAllowed = 'move';
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
  if (from !== index) useCarousel.getState().reorderSlides(from, index);
};
```

`reorderSlides` no store mantém o slide ativo atualizando seu índice:
```typescript
reorderSlides: (from, to) => set((s) => {
  const slides = [...s.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);
  // Atualiza o índice do slide ativo sem mudar qual slide é o ativo
  const active = s.activeSlideIndex;
  let newActive = active;
  if (active === from) newActive = to;
  else if (from < active && to >= active) newActive = active - 1;
  else if (from > active && to <= active) newActive = active + 1;
  return { slides, activeSlideIndex: newActive };
}),
```

### 5.3 Limite de slides

Ao atingir `CAROUSEL_MAX_SLIDES`:
- Botões "Novo slide" e "Duplicar" ficam `disabled`
- Toast: `"Chegou no limite! Um carrossel pode ter até 10 slides 🎠"`

---

## 6. Miniaturas (`src/canvas/hooks/useSlideThumb.ts`)

### 6.1 Estratégia de geração

```typescript
// Cache em nível de módulo (fora do React, sobrevive a re-renders)
const thumbCache = new Map<string, string>(); // slideId → dataURL
const hashCache = new Map<string, string>();  // slideId → hash do doc+finish

export function useSlideThumb(
  stageRef: React.RefObject<EditorCanvasHandle>,
  slide: SlideData,
  format: PostFormat,
  isActive: boolean,
): string | null {
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(slide.id) ?? null);

  useEffect(() => {
    // Slides não-ativos: lazy (só gera quando visible via IntersectionObserver)
    if (!isActive) return;

    const hash = JSON.stringify({ doc: slide.doc, finish: slide.finish });
    if (hashCache.get(slide.id) === hash) return; // sem mudança

    const timer = setTimeout(() => {
      const stage = stageRef.current?.getStage();
      const displayWidth = stageRef.current?.getDisplayWidth();
      if (!stage || !displayWidth) return;

      const thumbPixelRatio = CAROUSEL_THUMB_WIDTH / displayWidth;
      const dataUrl = stage.toDataURL({
        pixelRatio: thumbPixelRatio,
        mimeType: 'image/webp',
        x: stage.x(),
        y: stage.y(),
        width: displayWidth,
        height: (displayWidth * getPostDimensions(format).height) / getPostDimensions(format).width,
      });

      thumbCache.set(slide.id, dataUrl);
      hashCache.set(slide.id, hash);
      setThumb(dataUrl);
    }, CAROUSEL_THUMB_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [slide.doc, slide.finish, isActive, slide.id, stageRef, format]);

  return thumb;
}
```

### 6.2 Miniaturas de slides não-ativos

`SlideThumb` usa `IntersectionObserver` para disparar a geração apenas quando a miniatura entra na viewport da `SlideTray`. Ao entrar no viewport:
1. O slide não-ativo é carregado temporariamente no editor (sem alterar o `activeSlideIndex`)
2. O stage renderiza por um frame
3. `stage.toDataURL()` captura a miniatura
4. O slide ativo real é recarregado

> **Nota:** Esta operação é transparente para o usuário e ocorre apenas quando a tira de miniaturas rola até o slide.

---

## 7. Exportação do Carrossel (`src/lib/exportCarousel.ts`)

### 7.1 Assinatura

```typescript
import type Konva from 'konva';
import type { SlideData } from '../types';
import type { PostFormat } from '../brand/brand';

export interface ExportCarouselOptions {
  slides: SlideData[];
  format: PostFormat;
  stage: Konva.Stage;
  stageDisplayWidth: number;
  onProgress: (current: number, total: number) => void;
}

export async function exportCarousel(opts: ExportCarouselOptions): Promise<void>;
```

### 7.2 Algoritmo

```typescript
export async function exportCarousel({
  slides,
  format,
  stage,
  stageDisplayWidth,
  onProgress,
}: ExportCarouselOptions): Promise<void> {
  // JSZip importado dinamicamente (code splitting)
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const { width: postWidth, height: postHeight } = getPostDimensions(format);
  const pixelRatio = postWidth / stageDisplayWidth;
  const displayHeight = (stageDisplayWidth * postHeight) / postWidth;
  const pad = (n: number) => String(n).padStart(2, '0');

  for (let i = 0; i < slides.length; i++) {
    // 1. Carrega o slide no editor
    loadSlideIntoEditor(slides[i]);
    // 2. Aguarda re-render do Konva (um ciclo de RAF + margem)
    await new Promise((res) => setTimeout(res, 80));
    // 3. Garante fontes e imagens prontas
    await ensureFontsLoaded();
    const imageIds = collectDocImageIds(slides[i].doc);
    await ensureUserImagesReady(imageIds);
    // 4. Captura PNG
    const dataUrl = stage.toDataURL({
      pixelRatio,
      mimeType: 'image/png',
      x: stage.x(),
      y: stage.y(),
      width: stageDisplayWidth,
      height: displayHeight,
    });
    // 5. Converte para Blob e adiciona ao ZIP
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    zip.file(`slide-${pad(i + 1)}.png`, blob);
    onProgress(i + 1, slides.length);
  }

  // 6. Gera e dispara o download do ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = `cuscuz-carrossel-${formatDateForFile()}.zip`;
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  fireCuteConfetti();
}
```

### 7.3 Integração no `App.tsx`

```typescript
const handleExportCarousel = async () => {
  const stage = canvasRef.current?.getStage();
  const displayWidth = canvasRef.current?.getDisplayWidth();
  if (!stage || !displayWidth) return;

  const { slides, format } = useCarousel.getState();
  const guidesWereVisible = useEditor.getState().layoutGuides.visible;

  try {
    useCarousel.getState().setExporting({ current: 0, total: slides.length });
    useEditor.getState().select(null);
    useEditor.getState().setEditing(null);
    useEditor.getState().setGuidesVisible(false);

    await exportCarousel({
      slides,
      format,
      stage,
      stageDisplayWidth: displayWidth,
      onProgress: (current, total) =>
        useCarousel.getState().setExporting({ current, total }),
    });

    useEditor.getState().showToast('success', 'Carrossel exportado! 🌽 Prontinho pro Insta!');
  } catch (err) {
    useEditor.getState().showToast('error', `Erro ao exportar slide 😵 Tente novamente.`);
  } finally {
    useCarousel.getState().setExporting(null);
    if (guidesWereVisible) useEditor.getState().setGuidesVisible(true);
    // Recarrega o slide que estava ativo antes da exportação
    const { slides: s, activeSlideIndex } = useCarousel.getState();
    loadSlideIntoEditor(s[activeSlideIndex]);
  }
};
```

---

## 8. Persistência e Boot

### 8.1 `debouncedLocalStorage` (extrair para `src/lib/storage.ts`)

Atualmente esta fábrica está embutida em `editorStore.ts`. Ela deve ser extraída para `src/lib/storage.ts` e reutilizada pelos dois stores:

```typescript
// src/lib/storage.ts
import type { StateStorage } from 'zustand/middleware';

export function debouncedLocalStorage(delay = 300): StateStorage {
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
```

### 8.2 Sanitização de `SlideData` restaurado

```typescript
function sanitizeSlide(raw: unknown): SlideData {
  const r = raw as Partial<SlideData> | null | undefined;
  return {
    id: typeof r?.id === 'string' && r.id ? r.id : uid(),
    doc: sanitize(r?.doc),         // reutiliza a função existente de editorStore
    finish: sanitizeFinish(r?.finish), // reutiliza a função existente de editorStore
  };
}
```

As funções `sanitize` e `sanitizeFinish` são exportadas de `editorStore.ts` (atualmente privadas; basta adicionar `export`).

### 8.3 GC multi-slide

```typescript
// src/lib/carouselGC.ts
import type { SlideData } from '../types';
import type { ImageEl } from '../types';

export function collectAllImageIds(slides: SlideData[]): Set<string> {
  const ids = new Set<string>();
  for (const slide of slides) {
    for (const el of slide.doc.elements) {
      if (el.kind === 'image') {
        ids.add(el.imageId);
        if ((el as ImageEl).cutFrom?.imageId) {
          ids.add((el as ImageEl).cutFrom!.imageId);
        }
      }
    }
  }
  return ids;
}

export function reconcileAllSlides(
  slides: SlideData[],
  availableIds: Set<string>,
): SlideData[] {
  return slides.map((slide) => ({
    ...slide,
    doc: {
      ...slide.doc,
      elements: slide.doc.elements.filter(
        (el) => el.kind !== 'image' || availableIds.has(el.imageId),
      ),
    },
  }));
}
```

---

## 9. Code Splitting

### 9.1 `vite.config.ts`

```typescript
// Acrescentar ao manualChunks existente:
carousel: ['jszip'],
```

### 9.2 Lazy imports no `App.tsx`

```typescript
const ModeSelector = React.lazy(() => import('./components/ModeSelector'));
const SlideTray    = React.lazy(() => import('./components/carousel/SlideTray'));
```

Ambos são envolvidos em `<React.Suspense fallback={null}>`. O código de `exportCarousel` usa `import('jszip')` dinâmico internamente, então o chunk `carousel` só é baixado quando a exportação é acionada pela primeira vez.

---

## 10. Novos Arquivos

```
src/
  types.ts                          + interface SlideData
  brand/brand.ts                    + CAROUSEL_MAX_SLIDES, CAROUSEL_THUMB_WIDTH,
                                      CAROUSEL_THUMB_DEBOUNCE
  lib/
    storage.ts                      debouncedLocalStorage (extraído de editorStore)
    carouselGC.ts                   collectAllImageIds, reconcileAllSlides
    exportCarousel.ts               exportCarousel()
  store/
    carouselStore.ts                useCarousel (Zustand + persist)
  components/
    ModeSelector.tsx                tela inicial de seleção de modo
    ModeSelector.module.css
    carousel/
      SlideTray.tsx                 tira de miniaturas + controles
      SlideTray.module.css
      SlideThumb.tsx                miniatura individual + badge ordinal
      SlideThumb.module.css
      SlidePickerDialog.tsx           diálogo de seleção de slide ao trocar carrossel → post único
      SlidePickerDialog.module.css
  canvas/hooks/
    useSlideThumb.ts                geração de miniatura com debounce + cache
```

**Arquivos modificados:**

| Arquivo | Alteração |
|---|---|
| `src/types.ts` | + `SlideData` |
| `src/brand/brand.ts` | + `CAROUSEL_MAX_SLIDES`, `CAROUSEL_THUMB_WIDTH`, `CAROUSEL_THUMB_DEBOUNCE` |
| `src/store/editorStore.ts` | exportar `sanitize` e `sanitizeFinish`; importar `debouncedLocalStorage` de `storage.ts` |
| `src/App.tsx` | branch `mode==='carousel'`; lazy `SlideTray`; lazy `ModeSelector`; `handleExportCarousel` |
| `src/components/Header.tsx` | botão "Exportar carrossel" condicional (mode==='carousel') |
| `src/components/ModeSelector.tsx` | lógica de troca Single→Carrossel sem confirmação; referência ao SlidePickerDialog |
| `main.tsx` | subscriber de sincronização; lógica de boot; `bootstrap()` |
| `vite.config.ts` | `manualChunks: { carousel: ['jszip'] }` |

---

## 11. Invariantes Críticas

1. **`useEditor` sempre reflete o Slide Ativo** — é o único canal de edição. Nunca manipular `slides[i].doc` diretamente durante a edição.
2. **Miniaturas nunca no localStorage** — o `Map<slideId, dataUrl>` em memória não persiste. Ao recarregar, as miniaturas são regeneradas sob demanda.
3. **Blobs de imagem nunca no localStorage** — regra existente, herdada e aplicada por slide.
4. **`temporal.clear()` ao trocar de slide** — garante que Ctrl+Z não "desfaz" a troca de slide nem mistura o histórico entre slides.
5. **Isolamento de chaves de localStorage** — `'cuscuz-insta-kit:rascunho'` é exclusiva do Modo Post Único; `'cuscuz-insta-kit:carrossel'` é exclusiva do Modo Carrossel.
6. **`updateActiveSlide` idempotente** — só grava quando `doc` ou `finish` mudam por referência, prevenindo loops de subscriber.
7. **Exportação sequencial** — apenas uma exportação de carrossel por vez; o botão é desabilitado durante o processo.

---

## Propriedades de Corretude

*Uma propriedade é uma característica ou comportamento que deve ser verdadeiro em todas as execuções válidas do sistema — essencialmente, uma afirmação formal sobre o que o software deve fazer. As propriedades servem como ponte entre especificações legíveis por humanos e garantias de corretude verificáveis automaticamente.*

### Propriedade 1: Formato uniforme dos slides

*Para qualquer* carrossel com formato `f` e qualquer slide `s` na lista de slides, o campo `s.doc.format` deve ser igual a `f`.

**Valida: Requisito 2.2**

---

### Propriedade 2: Integridade estrutural da lista de slides

*Para qualquer* sequência de operações de adição, remoção e duplicação de slides, o comprimento da lista `slides` deve sempre ser maior ou igual a 1 e menor ou igual a `CAROUSEL_MAX_SLIDES`.

**Valida: Requisitos 3.1, 3.4, 3.9**

---

### Propriedade 3: Adição de slide incrementa e ativa corretamente

*Para qualquer* lista de slides com `n < CAROUSEL_MAX_SLIDES` slides, após `addSlide()`, a lista deve ter `n + 1` slides e `activeSlideIndex` deve apontar para o último slide (índice `n`).

**Valida: Requisito 3.2**

---

### Propriedade 4: Duplicação preserva dados e cria identidade nova

*Para qualquer* slide ativo com `doc` e `finish`, após `duplicateSlide(i)`, o novo slide deve ter `doc` e `finish` com valores iguais (cópia profunda) ao original, mas `id` diferente.

**Valida: Requisito 3.3**

---

### Propriedade 5: Remoção mantém slide ativo válido

*Para qualquer* lista de slides com `n > 1` e qualquer índice de remoção `i`, após `removeSlide(i)`, a lista deve ter `n - 1` slides e `activeSlideIndex` deve estar no intervalo `[0, n - 2]`.

**Valida: Requisito 3.8**

---

### Propriedade 6: Reordenação preserva identidade do slide ativo

*Para qualquer* lista de slides e operação de reordenação `reorderSlides(from, to)`, o slide que era o ativo antes da operação deve continuar sendo o ativo depois (mesmo que seu índice mude).

**Valida: Requisito 3.10**

---

### Propriedade 7: Navegação respeita os limites da lista

*Para qualquer* lista de slides com `n` slides e `activeSlideIndex = i`, após `setActiveSlide(j)`, o novo `activeSlideIndex` deve ser `j` se `0 <= j < n`, e deve permanecer inalterado caso contrário.

**Valida: Requisitos 4.2, 4.3, 4.4**

---

### Propriedade 8: Troca de slide reseta estado do editor

*Para qualquer* estado do editor com `step != 0` ou `selectedIds != []`, após `setActiveSlide(j)`, o estado do editor deve ter `step === 0` e `selectedIds === []`.

**Valida: Requisito 4.8**

---

### Propriedade 9: Proporção das miniaturas corresponde ao formato

*Para qualquer* formato `f` e miniatura gerada, a razão `largura/altura` da miniatura deve ser igual à razão `width/height` do `POST_FORMATS[f]`.

**Valida: Requisito 5.5**

---

### Propriedade 10: Isolamento de edição por slide

*Para qualquer* carrossel com slides `s0, s1, ..., sN`, ao modificar qualquer elemento do slide ativo `si`, os `doc` e `finish` de todos os outros slides `sj` (onde `j ≠ i`) devem permanecer inalterados.

**Valida: Requisitos 6.1, 6.2**

---

### Propriedade 11: Limite de imagens aplicado por slide

*Para qualquer* slide, o número de elementos do tipo `image` em `slide.doc.elements` deve ser sempre menor ou igual a `IMAGE_MAX_COUNT` (5).

**Valida: Requisito 6.3**

---

### Propriedade 12: Limite do histórico de undo por slide

*Para qualquer* sequência de operações de edição em um slide ativo, o número de entradas no histórico temporal do `useEditor` não deve ultrapassar 50.

**Valida: Requisito 6.4**

---

### Propriedade 13: Undo/redo isolado ao slide ativo

*Para qualquer* carrossel com slides `s0, s1, ..., sN` e slide ativo `si`, executar `undo()` ou `redo()` deve modificar apenas `si.doc` ou `si.finish`, deixando todos os outros slides inalterados.

**Valida: Requisito 6.6**

---

### Propriedade 14: Nomenclatura correta dos arquivos no ZIP

*Para qualquer* lista de `n` slides exportada, os nomes dos arquivos no ZIP devem ser exatamente `slide-01.png`, `slide-02.png`, ..., `slide-NN.png`, onde `NN = n` com zero-padding de 2 dígitos.

**Valida: Requisito 7.3**

---

### Propriedade 15: Dimensões corretas na exportação

*Para qualquer* formato `f`, o `pixelRatio` calculado deve produzir um PNG com dimensões `POST_FORMATS[f].width × POST_FORMATS[f].height` pixels.

**Valida: Requisitos 7.9, 7.10**

---

### Propriedade 16: Round-trip de serialização do carrossel

*Para qualquer* estado de carrossel válido `{ slides, activeSlideIndex, format }`, após serializar com `JSON.stringify` e desserializar com `sanitizeSlide` por slide, o estado resultante deve ser semanticamente equivalente ao original (mesmos `doc`, `finish` válidos, sem blobs no payload).

**Valida: Requisitos 8.1, 8.8**

---

### Propriedade 17: Ausência de blobs no payload persistido

*Para qualquer* estado de carrossel, o JSON persistido no localStorage não deve conter campos com valores do tipo `Blob`, `ArrayBuffer` ou strings em base64 de imagem (comprimento > 1000 caracteres começando com `data:image`).

**Valida: Requisito 8.2**

---

### Propriedade 18: Reconciliação elimina referências órfãs

*Para qualquer* lista de slides e conjunto `availableIds` de imageIds presentes no IndexedDB, após `reconcileAllSlides(slides, availableIds)`, nenhum elemento de imagem em nenhum slide deve ter `imageId` ausente em `availableIds`.

**Valida: Requisitos 8.5, 8.6**

---

### Propriedade 19: GC preserva apenas blobs referenciados

*Para qualquer* conjunto de slides, o conjunto de `imageId`s retornado por `collectAllImageIds(slides)` deve ser exatamente o conjunto dos blobs que devem ser mantidos no IndexedDB — ou seja, a união de todos os `imageId` e `cutFrom.imageId` de todos os elementos de imagem de todos os slides.

**Valida: Requisito 8.7**

---

### Propriedade 20: Isolamento de chaves de persistência

*Para qualquer* operação do Modo Carrossel (add, remove, update, reorder, setActive), o valor armazenado na chave `'cuscuz-insta-kit:rascunho'` no localStorage não deve ser modificado.

**Valida: Requisito 9.2**

---

### Propriedade 21: Cache de miniaturas idempotente

*Para qualquer* slide com `doc` e `finish` fixos, chamar a função de geração de miniatura duas ou mais vezes deve retornar o mesmo `dataUrl` sem recapturar o Stage (o cache evita recálculo quando o hash do conteúdo não muda).

**Valida: Requisito 10.2**

---

## 12. Elemento de Ligação entre Slides (Crossover Visual Bidirecional)

### 12.1 Extensão do tipo `BaseEl`

```typescript
// src/types.ts — acrescentar campo opcional em BaseEl:
export interface BaseEl {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  /** true = este elemento vaza para o slide adjacente (anterior e/ou seguinte). */
  crossover?: boolean;
}
```

Sem impacto em elementos existentes: `crossover` ausente ou `false` é equivalente.

### 12.2 Zona de Sangria Bidirecional no EditorCanvas

Durante o arrasto de um elemento no slide ativo (handler `onDragMove`), quando o modo é carrossel:
- Se existe slide seguinte (`activeSlideIndex < slides.length - 1`) e `elementRightEdge > postW - CROSSOVER_ZONE`, ativa o indicador de sangria na **borda direita** (`x = postW - 80`).
- Se existe slide anterior (`activeSlideIndex > 0`) e `elementLeftEdge < CROSSOVER_ZONE`, ativa o indicador de sangria na **borda esquerda** (`x = 0`).

```typescript
const CROSSOVER_ZONE = 80; // px no espaço do post
const hasPrevSlide = activeSlideIndex > 0;
const hasNextSlide = activeSlideIndex < slides.length - 1;
const nodeRect = node.getClientRect({ relativeTo: layerRef.current });
const isNearLeftEdge = hasPrevSlide && nodeRect.x < CROSSOVER_ZONE;
const isNearRightEdge = hasNextSlide && nodeRect.x + nodeRect.width > postW - CROSSOVER_ZONE;
setCrossoverHint({ left: isNearLeftEdge, right: isNearRightEdge });
```

Ao soltar o elemento (`onDragEnd`):
- Se `isNearLeftEdge || isNearRightEdge`, grava `crossover: true`.
- Caso contrário, se `element.crossover` estava ativo, grava `crossover: false`.

### 12.3 Sincronização Bidirecional de Elementos Crossover e Manipulação em Qualquer Página

Para que a usuária possa **manipular um Elemento Crossover a partir de qualquer uma das páginas** que ele atravessa (selecionar, mover, redimensionar, rotacionar, espelhar, editar texto/cor/borda, reordenar camadas ou excluir) e para que o elemento **nunca suma ao escolher qualquer uma das páginas na conversão de Carrossel para Post Único**:

1. **Sincronização entre `doc.elements` de slides adjacentes (`src/lib/crossover.ts` e `carouselStore.ts`)**:
   - Quando um elemento `el` no slide ativo `i` atravessa a borda direita (`canElementBleedToSide(el, 'right', postW)` e `i < slides.length - 1`), `syncCrossoverFromActiveSlide` insere ou atualiza no `slides[i + 1].doc.elements` o elemento correspondente com o **mesmo `id`**, `x = el.x - postW`, `crossover: true` e todos os demais atributos (`y`, `scale`, `rotation`, `flipX`, `flipY`, propriedades de texto/imagem/logo) idênticos.
   - Quando um elemento `el` no slide ativo `i` atravessa a borda esquerda (`canElementBleedToSide(el, 'left', postW)` e `i > 0`), `syncCrossoverFromActiveSlide` insere ou atualiza no `slides[i - 1].doc.elements` o elemento correspondente com o **mesmo `id`**, `x = el.x + postW`, `crossover: true` e todos os demais atributos idênticos.
   - Quando o elemento é movido para longe da borda em **qualquer uma das páginas** (deixando de sangrar para a página vizinha), ele é removido do `doc.elements` da página vizinha e mantido apenas na página atual com `crossover` limpo.
   - Quando o elemento é excluído em **qualquer uma das páginas**, sua exclusão é propagada automaticamente para o slide adjacente que o compartilhava.
2. **Interatividade nativa em ambas as páginas (`EditorCanvas.tsx`)**:
   - Como o elemento compartilhado existe no `doc.elements` de ambos os slides em suas respectivas coordenadas locais (`x` no slide `i`, `x - postW` no slide `i + 1`), ao abrir qualquer um dos slides no `useEditor`, o elemento é renderizado pelos nós interativos padrão (`DecorationNode`, `TextNode`, `ImageNode`, `LogoNode`) com 100% de opacidade (`opacity: 1`), suporte completo ao `MirrorTransformerEl`, `proxyDrag`, `AlignToolbar` e painéis laterais.
   - `CrossoverMirrorNode` atua apenas como fallback caso um elemento de um slide adjacente ainda não tenha sido materializado no `doc.elements` ativo (`!doc.elements.some(cur => cur.id === el.id)`).
3. **Preservação na conversão Carrossel → Post Único (`SlidePickerDialog.tsx` + `extractSingleSlideData`)**:
   - Ao escolher um slide `k` para manter como Post Único, `extractSingleSlideData(slides, k, format)` garante que todos os elementos visíveis no slide `k` (tanto os criados no slide `k` quanto quaisquer elementos crossover vindos de `k - 1` ou `k + 1` em suas coordenadas locais `x ± postW`) estejam presentes no `doc.elements` resultante, limpando a flag `crossover`.

### 12.4 Exportação e Miniaturas

Tanto na geração de miniaturas (`useSlideThumb.ts`) quanto na exportação (`exportCarousel.ts`), os elementos crossover sincronizados estão presentes no Stage de cada slide (recortados pelo `clipWidth={postW}` da folha), garantindo que os PNGs exportados no ZIP e as miniaturas da tira apresentem a transição contínua perfeita entre slides adjacentes.

---

### Propriedade 22: Crossover bidirecional disponível e sincronizado em qualquer slide com vizinho

*Para qualquer* carrossel com `n > 1` slides, qualquer elemento posicionado atravessando a borda entre `i` e `i + 1` (ou entre `i` e `i - 1`) deve existir de forma sincronizada em ambos os slides (`x_{i+1} = x_i - postWidth`) e permitir edição, movimentação ou exclusão a partir de qualquer um dos dois slides. Apenas quando `n === 1` não há slides adjacentes e `crossover` é limpo.

**Valida: Requisitos 11.3, 11.4, 11.5, 11.6, 11.8**

---

### Propriedade 23: Preservação de elementos crossover ao converter Carrossel para Post Único

*Para qualquer* carrossel em que um elemento atravessa a borda entre dois slides adjacentes `A` e `B`, converter o carrossel para Post Único escolhendo tanto `A` quanto `B` (inclusive o slide que não importou originalmente o elemento) deve preservar o elemento no `doc.elements` do Post Único resultante na coordenada local daquele slide (`x - postWidth` ou `x + postWidth`), com `crossover` limpo.

**Valida: Requisitos 1.7, 11.9**

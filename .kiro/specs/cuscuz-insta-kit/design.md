# Documento de Design Técnico — Cuscuz Records Insta Kit

## Visão Geral

O **Cuscuz Records Insta Kit** é uma aplicação web estática de editor de posts para Instagram. Todo o processamento — incluindo renderização de canvas, exportação de imagem, armazenamento de blobs e remoção de fundo por IA — ocorre 100% no navegador do usuário, sem servidor de backend.

**Stack principal:**
- React 18 + TypeScript + Vite
- Konva.js (canvas 2D via React-Konva)
- Zustand + zundo (estado global + undo/redo temporal)
- IndexedDB (`cuscuz-insta-kit` / store `images`) — blobs de imagens do usuário
- `@huggingface/transformers` (remoção de fundo client-side com BiRefNet_lite)
- `@fontsource/londrina-solid` + `@fontsource/pt-sans-narrow` (fontes offline)
- CSS Modules + design tokens CSS (estética "caderninho nordestino")

---

## Estrutura de Dados Principal

### `Doc` — estado persistido no localStorage

```typescript
interface Doc {
  format?: PostFormat;         // '3:4' | '4:3' | '1:1' — padrão '3:4'
  backgroundId: string | null; // chave do preset em assets-manifest.json
  backgroundFlipX?: boolean;
  backgroundFlipY?: boolean;
  backgroundOffsetY?: number;  // 0–360 px (somente formato 1:1)
  elements: El[];              // ordem = camadas; último fica por cima
}
```

### `El` — elementos interativos do canvas

```typescript
type El = DecorationEl | ImageEl | TextEl | LogoEl;

interface BaseEl {
  id: string;           // uid aleatório (gerado pelo store)
  x: number; y: number; // centro do elemento em px do post
  rotation: number;     // graus
  scale: number;        // escala uniforme positiva
}

interface DecorationEl extends BaseEl {
  kind: 'decoration';
  assetId: string;      // chave no manifest (ex.: 'deco-flores')
  flipX: boolean; flipY: boolean;
}

interface TextEl extends BaseEl {
  kind: 'text';
  style: 'title' | 'highlight' | 'body';
  text: string;
  fontSize: number;     // px no espaço do post; scale sempre = 1 após commit
  lineHeight: number; letterSpacing: number;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  color: BrandColor;
  brandEffect: boolean; // traçado creme + sombra preta
  border: BorderKind;   // 'none' | 'yellow' | 'clay'
}

interface LogoEl extends BaseEl {
  kind: 'logo';
  variant: 'paper' | 'clean';
}

interface ImageEl extends BaseEl {
  kind: 'image';
  imageId: string;      // chave do registro no IndexedDB
  name: string;
  width: number; height: number; // dimensões processadas (máx 3000px no lado maior)
  flipX: boolean; flipY: boolean;
  cutFrom?: ImageMeta;  // imagem anterior ao recorte (para "Reverter fundo")
}
```

### `FinishState` — acabamentos da Etapa 5

```typescript
interface FinishState {
  paper: { enabled: boolean; opacity: number }          // 0–100
  grain: { enabled: boolean; intensity: number; size: GrainSize } // 0–100, 'P'|'M'|'G'
  borderTexture: { enabled: boolean; opacity: number }  // 0–100
}
```

Todos os campos de `FinishState` são inicializados com `enabled: false` (`FINISH_ENABLED_DEFAULT`). `Doc` + `FinishState` são serializados juntos na chave `cuscuz-insta-kit:rascunho` do localStorage (sem blobs — somente metadados).

---

## Arquitetura de Módulos

### `src/brand/brand.ts` — Fonte da Verdade da Identidade Visual

Exporta todas as constantes da marca: `COLORS`, `FONT_HEADLINE`, `FONT_BODY`, `TEXT_PRESETS`, `BRAND_EFFECT`, `BORDERS`, `BORDER_PAD`, `POST_FORMATS`, `getPostDimensions`, limites de fonte (`FONT_SIZE_MIN`/`MAX`, `BODY_MAX_WITHOUT_HEADING`), limites de imagem (`IMAGE_MAX_COUNT`, `IMAGE_MAX_SIDE`, `IMAGE_MAX_FILE_BYTES`), constantes de granulado (`GRAIN_SEED`, `GRAIN_TILE_SIZE`, `GRAIN_STDDEV`), guias de layout (`GUIDE_MARGIN_DEFAULT`, `GUIDE_SNAP_THRESHOLD`, `GUIDE_COLORS`) e zoom (`ZOOM_STEPS`).

Nenhum outro módulo deve definir constantes de marca — toda mudança de identidade visual passa aqui.

### `src/types.ts` — Contratos de Tipos Compartilhados

Re-exporta tipos de `brand.ts` e define `El`, `Doc`, `FinishState`, `Box`, `AlignMode`, `StepId` e `STEP_OF_KIND` (mapeamento `ElKind → StepId` para o painel lateral acompanhar a seleção).

### `src/store/editorStore.ts` — Estado Global (Zustand + zundo)

**Estado persistido** (partializa no localStorage e no histórico temporal):
- `doc: Doc` — o post em si
- `finish: FinishState` — os acabamentos

**Estado de sessão** (não persiste nem entra no undo):
- `selectedIds: string[]` — seleção múltipla (ordem de clique)
- `selectedId: string | null` — derivado: id único quando `selectedIds.length === 1`
- `editingId: string | null` — elemento em edição inline de texto
- `step: StepId` — etapa ativa do painel lateral
- `layoutGuides: LayoutGuides` — visibilidade e margem das guias
- `zoom: number` — fator de zoom
- `fitWidth: number` — largura de ajuste à tela (base do zoom)

**Undo/Redo (zundo):**
- Limite: 50 snapshots
- Debounce: 400 ms (agrupa arrastos e sliders num único passo)
- Equality: por referência (`a.doc === b.doc && a.finish === b.finish`)
- Após hydrate: `temporal.clear()` para o histórico começar limpo

**Sanitização no merge:**
```typescript
function sanitize(doc): Doc // remove assets inexistentes, valida formato, clamp offsetY
function sanitizeFinish(f): FinishState // clamp opacidades, valida tamanho de grão
```

**Invariante de seleção:**
`selectedId` é sempre derivado de `selectedIds` via `selection(ids)`:
```typescript
const selection = (ids: string[]) => ({
  selectedIds: ids,
  selectedId: ids.length === 1 ? ids[0] : null,
})
```

**Subscriber de poda pós-undo:**
```typescript
useEditor.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  const pruned = pruneIds(s.selectedIds, s.doc.elements);
  if (pruned.length !== s.selectedIds.length) useEditor.setState(selection(pruned));
});
```

### `src/assets.ts` — Acesso Tipado ao Manifest

```typescript
// Gerado por scripts/build-assets.mjs
getBackground(id) → AssetEntry | null
getDecoration(id) → AssetEntry | null
getLogo(variant) → AssetEntry
```

### `src/lib/` — Lógica Pura e Reutilizável

#### `textRules.ts`
Regra **Texto ≤ Título** (Requisito 5.5–5.8):

```typescript
textSizeLimits(elements, target) → SizeLimits  // min, max, reason
clampTextSize(elements, target, requested) → ClampResult  // { value, error }
effectiveSize(t: TextEl) → number  // fontSize * scale
```

A função `clampTextSize` é a única porta de entrada para alterar `fontSize` de qualquer `TextEl` — tanto pelo store (`setTextSize`) quanto pelo canvas (`buildTransformPatches → enforceTextRule`).

#### `align.ts`
Álgebra pura de alinhamento e snap (sem dependências de Konva ou React):

```typescript
alignDelta(box, mode, pageW, pageH) → { dx, dy }
snapToCenter(box, pageW, pageH, threshold) → { dx, dy, v, h }
snapToGuides(box, pageW, pageH, opts, threshold) → { dx, dy, snappedX, snappedY }
rotatedBox(cx, cy, w, h, deg) → Box  // AABB do retângulo girado
```

#### `multiSelect.ts`
Lógica pura da seleção múltipla e transformações em lote:

```typescript
isMultiModifier(evt) → boolean                        // Ctrl/Cmd/Shift
toggleId(ids, id) → string[]                          // adiciona ou remove (involutório)
pruneIds(ids, elements) → string[]                    // remove ids fantasmas pós-undo
unionBox(boxes) → Box | null                          // AABB do grupo
groupScaleBounds(elements, ids) → GroupScaleBounds    // min/max escala mantendo regra de texto
buildTransformPatches(elements, results) → ElPatch[]  // Konva → doc patches (aplica enforceTextRule)
duplicateGroup(elements, ids, newId) → DuplicateResult
reorderForward(elements, ids) → El[]
reorderBackward(elements, ids) → El[]
applyElPatches(elements, patches) → El[]
```

#### `imageRules.ts`
Regras e funções puras para imagens do usuário:

```typescript
isSupportedImageFile(file) → boolean    // raster sim, SVG não
isImageFileTooBig(file) → boolean       // > 25 MB
downscaleDimensions(w, h, maxSide) → { width, height }
initialImageScale(w, h, fill, postW, postH) → number
clampImageCenter(x, y, postW, postH) → { x, y }
hasImageSlots(elements) → boolean       // count < IMAGE_MAX_COUNT (5)
isPersistedImage(el) → boolean          // metadados completos
```

#### `imageImport.ts`
Orquestra a fila de importação de arquivos:

```typescript
importImageFiles(files, at?) → Promise<number>
// Fluxo: validação → importUserImage → addImage no store
// Processa arquivos sequencialmente (FIFO); emite toasts da marca em caso de erro
```

#### `userImages.ts`
Interface com o IndexedDB + registry em memória de object URLs:

```typescript
// IndexedDB CRUD
hydrateUserImages() → Promise<Set<string>>    // boot: carrega todos os blobs
collectGarbageImages(keep) → Promise<void>    // GC de órfãos
importUserImage(file) → Promise<ImportedImage>
registerProcessedImage(blob, name, w, h) → Promise<ImportedImage>
ensureUserImagesReady(ids) → Promise<void>    // aguarda decodificação antes do export
// Hook reativo
useUserImage(imageId) → UserImageEntry | null
```

**Pipeline de importação por arquivo:**
1. Validar mime type e tamanho
2. Decodificar com `createImageBitmap` (fallback `<img>`)
3. `downscaleDimensions` → máx 3000 px no maior lado
4. `renderToBlob` (WebP q0.92 → fallback JPEG)
5. Gerar miniatura 320 px
6. Gravar `StoredImage` no IndexedDB
7. Criar object URLs, registrar no registry em memória, emitir para subscribers

#### `bgRemoval.ts`
Pipeline client-side de remoção de fundo com BiRefNet_lite 512 (`studioludens/birefnet-lite-512`, fp16 ~94 MB, MIT):

```typescript
ensureBgModel(onProgress) → Promise<void>    // download único → cache do browser
removeBackground(imageUrl, mode) → Promise<Blob>  // 'person' | 'object'
```

Modos calibrados:
- **Pessoa** (`person`): alpha suave com `fbFusionForeground` + `gaussianBlur` para cabelos
- **Objeto** (`object`): máscara firme com `median3x3` + curva estreita + `erode3x3`

A imagem resultante é codificada em WebP com canal alpha (fallback PNG — nunca JPEG).

#### `bgRemovalStatus.ts`
Máquina de estado reativa (module-level, `useSyncExternalStore`) para o ciclo de vida do download/inferência:

```typescript
type BgModelPhase = 'idle' | 'downloading' | 'ready' | 'error'
useBgModelStatus() → BgModelStatus    // { phase, progress, loadedBytes, totalBytes, error }
useBgProcessing() → BgProcessing | null  // { imageElId, mode, label }
setBgModelStatus(patch) / setBgModelReady() / setBgModelError(code)
beginBgProcessing(next) / endBgProcessing()
```

#### `grain.ts`
Geração determinística de ruído gaussiano (tile 512×512) para o acabamento Granulado:

```typescript
mulberry32(seed) → () => number      // PRNG com seed
makeGrainData(size, seed, stddev) → Uint8ClampedArray
makeGrainTile(size, seed) → HTMLCanvasElement | null  // cacheado por size:seed
```

O seed fixo `GRAIN_SEED = 20261016` garante que o grão seja **idêntico** no preview interativo e na exportação de alta resolução.

#### `export.ts`

```typescript
exportPost({ stage, stageDisplayWidth, postWidth, postHeight }) → Promise<void>
fireCuteConfetti()
```

Fluxo de exportação:
1. `ensureFontsLoaded()` — aguarda `document.fonts.ready`
2. `collectUserImageIds(stage)` + `ensureUserImagesReady(ids)` — aguarda decodificação
3. `pixelRatio = postWidth / stageDisplayWidth`
4. `stage.toDataURL({ pixelRatio, mimeType: 'image/png', x, y, width, height })`
5. Tenta Web Share API com `File`; em caso de recusa ou não-suporte, faz download via `<a download>`
6. `fireCuteConfetti()` — animação comemorativa com as cores da marca

---

## Arquitetura de Componentes

### `src/canvas/` — Canvas Konva

```
EditorCanvas.tsx       Stage + Layer principal; event handlers de seleção, drag, drop
BackgroundNode.tsx     Fundo com clip, rotação (4:3), offset (1:1), flip centralizado
DecorationNode.tsx     Enfeite/grafismo com blend mode (soft-light / divide)
TextNode.tsx           Texto com efeito da marca (2 passes: stroke+shadow → fill) e bordas
InlineTextEditor.tsx   <textarea> sobreposta ao canvas sincronizada com TextNode
LogoNode.tsx           Logo com duas variantes
ImageNode.tsx          Imagem do usuário; marca data.userImageId para coleta no export
SnapGuides.tsx         Linhas de snap visuais em tempo real (não exportadas)
LayoutGuides.tsx       Guias de margem/centro/terços (não exportadas)
TextureOverlays.tsx    Overlays de papel, textura de borda e granulado na camada superior
```

**Ciclo de renderização do `TextNode` com Efeito da Marca:**
1. Camada de sombra + traçado creme 2 px externo (`strokeWidth = strokeOutside * 2 + fill`, deslocada por `shadowDistance`)
2. Camada de preenchimento puro sobreposta (elimina traçado interno e sombra interna nos cantos da tipografia)

**`ImageNode`:** O group Konva recebe `data={{ userImageId: el.imageId }}` para que `collectUserImageIds` encontre todas as imagens antes do `stage.toDataURL`.

### `src/steps/` — Painéis Laterais das 6 Etapas

| Componente | Etapa | Conteúdo principal |
|---|---|---|
| `BackgroundStep.tsx` | 0. Fundo | Galeria de presets (thumbs), slider offsetY, botões "Topo/Centro/Base", toggles de flip |
| `DecorationStep.tsx` | 1. Enfeites | Grid de enfeites/grafismos/moldura, botões de canto (TL/TR/BL/BR) |
| `ImageStep.tsx` | 2. Imagem | Seletor e drop zone, lista de `ImageEl`, card de remoção de fundo (inline) |
| `TextStep.tsx` | 3. Texto | Botões de preset, sliders de fontSize/lineHeight/letterSpacing, swatches de cor, toggles de efeito/borda |
| `LogoStep.tsx` | 4. Logo | Toggle variante, botões P/M/G, grid de 7 posições rápidas |
| `TextureStep.tsx` | 5. Textura | 3 acordeões: papel, textura de borda, granulado — cada um com toggle + slider |

### `src/components/`

```
Header.tsx          Seletor de formato (3:4/4:3/1:1), botão Exportar, undo/redo
Stepper.tsx         Navegação numerada entre as 6 etapas
AlignToolbar.tsx    Alinhamento à página, camadas, duplicar/excluir (uni e multi-seleção)
GuideToolbar.tsx    Margem e visibilidade das guias de layout
ZoomControls.tsx    Zoom com ZOOM_STEPS [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
Toast.tsx           Notificações de marca (tom caloroso, PT-BR)
ConfirmDialog.tsx   Diálogo de confirmação para ações destrutivas
```

### `src/components/ui/` — Design System

Componentes atômicos com estética "caderninho nordestino": `Button`, `IconButton`, `Card`, `Slider`, `SegmentedControl`. Sombras sólidas `0 4px 0 #0b0500`, bordas de 3 px, micro-interações de pressão.

---

## Fluxo de Dados

```
Usuário interage
       │
       ▼
steps/ ou canvas/           ← lê do store via hooks Zustand
       │
       ▼
editorStore.ts (action)     ← atualiza doc/finish/selectedIds/step
       │
       ▼
zundo temporal             ← snapshot com debounce 400ms (limit 50)
       │
       ▼
Zustand notifica subscribers
       │
       ▼
React re-renderiza canvas/  ← EditorCanvas + Nodes Konva
```

O preview do canvas e a exportação usam o **mesmo Stage Konva** — somente o `pixelRatio` difere.

---

## Persistência e Inicialização

### localStorage
- Chave: `cuscuz-insta-kit:rascunho`
- Conteúdo: `{ doc: Doc, finish: FinishState }` (JSON puro, sem blobs)
- Escrita com debounce 300 ms + flush no `beforeunload`

### IndexedDB
- Banco: `cuscuz-insta-kit`, versão 1, store `images`
- Registro: `{ id, blob, thumb, name, width, height, createdAt }`
- Blobs não são revogados ao excluir elemento (undo precisa deles); GC roda no boot

### Sequência de boot

```
1. Zustand hydrate (merge + sanitize + sanitizeFinish)
2. temporal.clear()           ← histórico limpo após restaurar rascunho
3. hydrateUserImages()        ← carrega blobs do IndexedDB, retorna Set<string>
4. reconcileImages(availableIds) ← remove ImageEl sem blob do doc
5. collectGarbageImages(keep) ← remove blobs órfãos do IndexedDB
6. (opcional) adicionar snapshot inicial ao temporal para capturar rascunho reconciliado
```

---

## Pipeline de Assets (`scripts/build-assets.mjs`)

Lê as pastas raiz:
- `BACKGROUNDS PRESETS/` → `bg-pronto-{1..5}.webp`
- `BACKGROUND PUROS/` → `bg-puro-{1..5}.webp`
- `ENFEITE/` → `deco-{flores,folhas-1,...}.webp`
- `GRAFISMOS/` → `deco-{chain,esqueleto,...}.webp`
- `JANELA/` → `deco-janela.webp`
- `LOGO/` → `logo-paper.webp`, `logo-clean.webp`
- `TEXTURE/` → `papel-textura.webp`
- `BORDER/` → `textura-borda.webp`

Para cada imagem: otimiza para WebP lossless, gera miniatura 320 px em `public/brand/thumbs/`, escreve `src/assets-manifest.json` com metadados (width, height, path, fullSheet).

O manifest é importado estaticamente por `src/assets.ts` e validado em tempo de build pelo TypeScript.

---

## Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| Asset não encontrado no manifest (doc antigo) | `sanitize()` remove do doc silenciosamente |
| ImageEl sem blob no IndexedDB | `reconcileImages()` remove do doc no boot |
| IndexedDB indisponível | `importUserImage` funciona em modo só-em-sessão; exibe toast |
| Arquivo SVG submetido | Toast de erro "Hm, esse formato de arquivo não rola 🙈" |
| Arquivo > 25 MB | Toast de erro "Opa, mais de 25 MB! Manda uma imagem mais leve 🌽" |
| Limite de 5 imagens atingido | Toast "Tá lotado! Cabem até 5 imagens por post 😅" |
| Texto body > limite | Toast "Opa! O texto não pode ficar maior que o título 🙈" |
| Falha no download do modelo BiRefNet | `setBgModelError('bg-model')` + mensagem na UI |
| Cancelamento de remoção de fundo | Invalida epoch atual; download continua em background |
| Exportação sem fundo selecionado | Toast "Escolha um fundo primeiro" (bloqueio no Stepper) |

---

## Regras de Negócio Críticas

### Regra Texto ≤ Título (Req. 5.5–5.8)

A hierarquia tipográfica é mantida por `clampTextSize()` (única porta de escrita de `fontSize`) e por `enforceTextRule()` (rede de segurança aplicada ao commitar transformações em lote):

- `body.fontSize ≤ min(title.fontSize, highlight.fontSize)` para todos os títulos do post
- Sem títulos: `body.fontSize ≤ BODY_MAX_WITHOUT_HEADING` (72 px)
- `title/highlight.fontSize ≥ max(body.fontSize)` para todos os corpos do post
- `FONT_SIZE_MIN (16) ≤ qualquer fontSize ≤ FONT_SIZE_MAX (320)`

### Regra do Fundo Travado (Req. 1.6–1.7)

O `BackgroundNode` recebe `draggable={step === 0}` e `listening={step === 0}`. O deslize vertical (`backgroundOffsetY`, range 0–360) só é aplicado no formato 1:1 — nos formatos 3:4 e 4:3 o fundo cobre a folha sem recorte vertical.

### Regra da Logo Única (Req. 6.1)

`addLogo(variant)` verifica `elements.find(e => e.kind === 'logo')`: se existe, troca a variante mantendo a largura visual; se não existe, insere nova. `duplicateGroup` ignora `LogoEl` e emite toast.

### Regra de Imagens (Req. 3.8, 3.10, 3.13)

- `hasImageSlots(elements)` é verificado antes de qualquer `addImage` ou `duplicateElement`
- Blobs não são revogados ao excluir `ImageEl` — GC ocorre apenas no boot
- `el.cutFrom` preserva a referência à imagem anterior ao recorte; o GC considera `cutFrom.imageId` como referência válida

---

## Propriedades de Corretude

*Uma propriedade é uma característica ou comportamento que deve ser verdadeiro em todas as execuções válidas do sistema — essencialmente, uma afirmação formal sobre o que o sistema deve fazer. As propriedades servem de ponte entre especificações legíveis por humanos e garantias de corretude verificáveis automaticamente.*

### Propriedade 1: Round-trip de serialização do Doc

*Para qualquer `Doc` válido*, serializar em JSON e desserializar via `sanitize()` deve preservar todos os campos não-corrompidos: `format`, `backgroundId`, `backgroundFlipX`, `backgroundFlipY`, `backgroundOffsetY` e o array de `elements` (exceto os que referenciam assets inexistentes no manifest).

**Valida: Requisitos 1.9, 9.9, 11.4**

---

### Propriedade 2: backgroundOffsetY sempre no intervalo válido

*Para qualquer valor numérico* passado a `setBackgroundOffsetY()`, o `doc.backgroundOffsetY` resultante deve estar no intervalo `[0, 360]`.

**Valida: Requisito 1.6**

---

### Propriedade 3: Flip do fundo é involutório

*Para qualquer estado de* `backgroundFlipX` e `backgroundFlipY`, aplicar o mesmo toggle duas vezes consecutivas retorna ao estado original (round-trip).

**Valida: Requisito 1.8**

---

### Propriedade 4: isSupportedImageFile rejeita SVG e aceita formatos raster

*Para qualquer arquivo* com mime type pertencente a `{image/png, image/jpeg, image/webp, image/gif, image/avif, image/bmp}`, `isSupportedImageFile` deve retornar `true`. *Para qualquer arquivo* com mime type `image/svg+xml` (ou variante), deve retornar `false`.

**Valida: Requisitos 3.1, 3.3**

---

### Propriedade 5: isImageFileTooBig rejeita arquivos acima do limite

*Para qualquer arquivo* com `size > IMAGE_MAX_FILE_BYTES` (25 MB), `isImageFileTooBig` deve retornar `true`. *Para qualquer arquivo* com `size ≤ IMAGE_MAX_FILE_BYTES`, deve retornar `false`.

**Valida: Requisito 3.4**

---

### Propriedade 6: downscaleDimensions preserva proporção e respeita o limite

*Para qualquer par de dimensões* `(w > 0, h > 0)`, `downscaleDimensions(w, h, maxSide)` deve garantir que:
- `max(width', height') ≤ maxSide`
- A razão de aspecto `width' / height'` é aproximadamente igual a `w / h` (tolerância de arredondamento ±1 px)
- Nenhuma ampliação: se `max(w, h) ≤ maxSide`, então `width' === round(w)` e `height' === round(h)`

**Valida: Requisito 3.5**

---

### Propriedade 7: hasImageSlots retorna false quando o limite é atingido

*Para qualquer lista de elementos* com `count(kind === 'image') ≥ IMAGE_MAX_COUNT`, `hasImageSlots` deve retornar `false`. *Para qualquer lista* com `count < IMAGE_MAX_COUNT`, deve retornar `true`.

**Valida: Requisito 3.8**

---

### Propriedade 8: reconcileImages remove somente os ImageEl sem blob disponível

*Para qualquer `Doc`* contendo `ImageEl` e *para qualquer `Set<string>`* de ids disponíveis no IndexedDB, após `reconcileImages(availableIds)` todos os `ImageEl` remanescentes no doc devem ter `imageId ∈ availableIds`, e todos os demais elementos (não-imagem) devem ser preservados intactos.

**Valida: Requisito 3.11**

---

### Propriedade 9: replaceImage preserva largura visual da imagem

*Para qualquer `ImageEl`* com largura natural `w` e escala `s`, após `replaceImage(id, { width: w2, ... })`, a largura visual `w2 × s'` deve ser igual a `w × s` (tolerância de ponto flutuante).

**Valida: Requisito 4.10**

---

### Propriedade 10: reverter fundo (cutFrom) restaura imageId original

*Para qualquer `ImageEl`* com `cutFrom` definido, chamar `replaceImage(id, el.cutFrom)` deve restaurar o `imageId` para `el.cutFrom.imageId` e o `cutFrom` resultante deve ser `undefined` (limpado).

**Valida: Requisito 4.12**

---

### Propriedade 11: clampTextSize nunca viola a regra Texto ≤ Título

*Para qualquer lista de elementos* e *para qualquer `TextEl` alvo*, `clampTextSize(elements, target, requested).value` deve satisfazer:
- Se `target.style === 'body'` e existem títulos: `value ≤ min(effectiveSize(heading))` para todos os headings
- Se `target.style === 'body'` e não existem títulos: `value ≤ BODY_MAX_WITHOUT_HEADING` (72 px)
- Se `target.style !== 'body'` e existem bodies: `value ≥ max(effectiveSize(body))` para todos os bodies
- Em todos os casos: `FONT_SIZE_MIN ≤ value ≤ FONT_SIZE_MAX`

**Valida: Requisitos 5.5, 5.6, 5.7, 5.8, 5.11**

---

### Propriedade 12: enforceTextRule garante consistência global de fontes

*Para qualquer lista de elementos* `El[]`, após `enforceTextRule(elements)` a lista resultante deve satisfazer a regra Texto ≤ Título para todos os pares de body/heading presentes, e nenhum `fontSize` deve estar fora de `[FONT_SIZE_MIN, FONT_SIZE_MAX]`.

**Valida: Requisitos 5.5, 5.6, 5.11, 8.8**

---

### Propriedade 13: toggleId é involutório (round-trip de seleção)

*Para qualquer lista de ids* e *para qualquer id*, `toggleId(toggleId(ids, id), id)` deve ser igual a `ids` (mesmos elementos, mesma ordem).

**Valida: Requisitos 8.1, 8.2**

---

### Propriedade 14: pruneIds remove somente ids ausentes do doc

*Para qualquer lista de ids selecionados* e *para qualquer lista de elementos*, `pruneIds(ids, elements)` deve retornar somente os ids que existem em `elements`, sem duplicatas e na ordem original.

**Valida: Requisito 8.3**

---

### Propriedade 15: buildTransformPatches produz resultado que satisfaz enforceTextRule

*Para qualquer lista de elementos* e *para qualquer resultado de Transformer Konva* (`NodeResult[]`), `buildTransformPatches(elements, results)` deve produzir patches tais que aplicar `applyElPatches` + `enforceTextRule` sobre o resultado gere uma lista em que a regra Texto ≤ Título é satisfeita para todos os elementos.

**Valida: Requisitos 5.5, 5.6, 8.6, 8.8**

---

### Propriedade 16: duplicateGroup respeita IMAGE_MAX_COUNT

*Para qualquer lista de elementos* com `count(image) = c` e *para qualquer subconjunto de ids* contendo `n` imagens, se `c + n > IMAGE_MAX_COUNT`, `duplicateGroup` deve retornar `blocked = 'noImageSlots'` e não modificar a lista de elementos.

**Valida: Requisitos 3.8, 8.11**

---

### Propriedade 17: makeGrainData é determinístico para o mesmo seed

*Para qualquer tamanho* `size > 0` e *para qualquer seed*, duas chamadas consecutivas a `makeGrainData(size, seed)` devem retornar arrays com os mesmos valores pixel a pixel (idempotência determinística do PRNG).

**Valida: Requisito 7.7**

---

### Propriedade 18: snapToGuides retorna deltas dentro do threshold

*Para qualquer caixa `Box`*, *para qualquer configuração de guias ativas* e *para qualquer threshold ≥ 0*, quando `snapToGuides` retorna `snappedX = true`, deve-se ter `|dx| ≤ threshold`; quando `snappedX = false`, deve-se ter `dx = 0`. Analogamente para `snappedY` e `dy`.

**Valida: Requisito 10.5**

---

### Propriedade 19: alignDelta alinha a caixa perfeitamente à página

*Para qualquer caixa `Box`* e *para qualquer modo de alinhamento*, a caixa deslocada por `(dx, dy) = alignDelta(box, mode, pageW, pageH)` deve estar perfeitamente alinhada à borda ou centro correspondente da página (erro zero em ponto flutuante, exceto arredondamento de sub-pixel).

**Valida: Requisito 10 (AlignToolbar), Requisito 8.10**

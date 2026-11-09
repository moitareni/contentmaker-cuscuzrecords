# Plano de Implementação — Carrossel de Posts para Instagram

## Visão Geral

Implementação incremental do Modo Carrossel para o Cuscuz Records Insta Kit em TypeScript/React. A estratégia segue oito etapas: fundação de tipos e utilitários puros → persistência e boot → tela inicial → tira de miniaturas → gerenciamento de slides → isolamento de undo/redo → exportação ZIP → code splitting. O editor existente não é refatorado; o `useCarousel` orquestra em torno dele.

---

## Tarefas

- [x] 1. Fundação — tipos, constantes, utilitários puros e instalação da dependência
  - [x] 1.1 Instalar `jszip` como dependência de produção com versão exata
    - Executar `npm install jszip --save-exact` a partir de `insta-kit/`
    - Verificar que `package.json` passa a conter `"jszip"` em `dependencies`
    - _Requisitos: 9.3_

  - [x] 1.2 Adicionar `SlideData` em `src/types.ts`
    - Acrescentar a interface `SlideData { id: string; doc: Doc; finish: FinishState }` exportada
    - Não remover nem alterar nenhuma interface existente
    - _Requisitos: 3.1, 8.1_

  - [x] 1.3 Adicionar constantes de carrossel em `src/brand/brand.ts`
    - Acrescentar `CAROUSEL_MAX_SLIDES = 10`, `CAROUSEL_THUMB_WIDTH = 270` e `CAROUSEL_THUMB_DEBOUNCE = 400` exportados
    - Não alterar nenhuma constante ou exportação existente
    - _Requisitos: 3.4, 3.5, 5.3, 10.1, 10.3_

  - [x] 1.4 Criar `src/lib/storage.ts` extraindo `debouncedLocalStorage` de `editorStore.ts`
    - Mover a função `debouncedLocalStorage` (atualmente privada em `editorStore.ts`) para `src/lib/storage.ts` e exportá-la
    - Atualizar o import em `src/store/editorStore.ts` para usar a versão de `storage.ts`
    - A lógica de flush no `beforeunload` deve permanecer intacta
    - _Requisitos: 8.3, 9.2_

  - [x]* 1.5 Escrever testes unitários para `debouncedLocalStorage`
    - Testar que `setItem` grava com debounce (mock de timers)
    - Testar que `getItem` e `removeItem` operam sobre `localStorage` diretamente
    - Testar que o flush imediato ocorre no `beforeunload`
    - _Requisitos: 8.3_

  - [x] 1.6 Criar `src/lib/carouselGC.ts` com `collectAllImageIds` e `reconcileAllSlides`
    - Implementar `collectAllImageIds(slides: SlideData[]): Set<string>` — union de `imageId` e `cutFrom?.imageId` de todos os elementos de imagem de todos os slides
    - Implementar `reconcileAllSlides(slides: SlideData[], availableIds: Set<string>): SlideData[]` — filtra elementos de imagem com `imageId` ausente do `availableIds`, por slide
    - _Requisitos: 8.5, 8.6, 8.7_

  - [x]* 1.7 Escrever testes de propriedade para `collectAllImageIds`
    - **Propriedade 19: GC preserva apenas blobs referenciados**
    - **Valida: Requisito 8.7**
    - Para qualquer lista de slides gerada arbitrariamente, `collectAllImageIds` deve retornar exatamente a union de `imageId` + `cutFrom.imageId` de todos os elementos de imagem de todos os slides

  - [x]* 1.8 Escrever testes de propriedade para `reconcileAllSlides`
    - **Propriedade 18: Reconciliação elimina referências órfãs**
    - **Valida: Requisitos 8.5, 8.6**
    - Para qualquer lista de slides e qualquer conjunto `availableIds`, após `reconcileAllSlides`, nenhum elemento de imagem em nenhum slide deve ter `imageId` ausente de `availableIds`

- [x] 2. Store do carrossel (`src/store/carouselStore.ts`)
  - [x] 2.1 Criar `src/store/carouselStore.ts` com estado, persistência e actions de lista
    - Implementar o store Zustand com persist na chave `'cuscuz-insta-kit:carrossel'` usando `debouncedLocalStorage(300)`
    - Campos persistidos: `slides`, `activeSlideIndex`, `format`, `mode`; campos de sessão: `isExporting`, `exportProgress`
    - Implementar `addSlide()`: insere `SlideData` com `Doc` vazio e `FinishState` padrão ao final, torna-o ativo
    - Implementar `duplicateSlide(index)`: cópia profunda do `doc` e `finish`, `id` novo com `uid()`, inserida após o slide de origem, torna-a ativa
    - Implementar `removeSlide(index)`: remove o slide, ajusta `activeSlideIndex` para o anterior ou seguinte
    - Implementar `reorderSlides(from, to)`: reordena preservando a identidade do slide ativo (atualiza `activeSlideIndex` conforme cálculo do design)
    - Implementar `setActiveSlide(index)`: guarda o índice somente se `0 <= index < slides.length`
    - Implementar `updateActiveSlide(doc, finish)`: grava somente se `doc` ou `finish` mudaram por referência (idempotente)
    - Implementar `setMode`, `setFormat`, `setExporting`, `resetCarousel`
    - Exportar `sanitizeSlide` e `defaultSlide` para uso no boot
    - Acrescentar `export { sanitize, sanitizeFinish }` em `src/store/editorStore.ts` (as funções existem mas são privadas)
    - _Requisitos: 3.1, 3.2, 3.3, 3.6, 3.8, 3.10, 8.1, 8.2, 8.3, 8.8_

  - [x]* 2.2 Escrever testes de propriedade para `addSlide`
    - **Propriedade 3: Adição de slide incrementa e ativa corretamente**
    - **Valida: Requisito 3.2**
    - Para qualquer estado com `n < CAROUSEL_MAX_SLIDES` slides, após `addSlide()`, `slides.length === n + 1` e `activeSlideIndex === n`

  - [x]* 2.3 Escrever testes de propriedade para `duplicateSlide`
    - **Propriedade 4: Duplicação preserva dados e cria identidade nova**
    - **Valida: Requisito 3.3**
    - Para qualquer slide `i`, após `duplicateSlide(i)`, o novo slide tem `doc` e `finish` iguais (por valor) ao original, mas `id` diferente

  - [x]* 2.4 Escrever testes de propriedade para `removeSlide`
    - **Propriedade 5: Remoção mantém slide ativo válido**
    - **Valida: Requisito 3.8**
    - Para qualquer lista com `n > 1` e qualquer `i` válido, após `removeSlide(i)`, `slides.length === n - 1` e `activeSlideIndex ∈ [0, n - 2]`

  - [x]* 2.5 Escrever testes de propriedade para `reorderSlides`
    - **Propriedade 6: Reordenação preserva identidade do slide ativo**
    - **Valida: Requisito 3.10**
    - Para qualquer `from` e `to` válidos, o slide identificado pelo `id` do ativo antes da operação deve continuar sendo o ativo depois

  - [x]* 2.6 Escrever testes de propriedade para `setActiveSlide`
    - **Propriedade 7: Navegação respeita os limites da lista**
    - **Valida: Requisitos 4.2, 4.3, 4.4**
    - Para qualquer `j >= n` ou `j < 0`, `setActiveSlide(j)` não deve alterar `activeSlideIndex`

  - [x]* 2.7 Escrever testes de propriedade de integridade da lista de slides
    - **Propriedade 2: Integridade estrutural da lista de slides**
    - **Valida: Requisitos 3.1, 3.4, 3.9**
    - Para qualquer sequência de `addSlide`, `removeSlide` e `duplicateSlide`, `slides.length` deve sempre permanecer em `[1, CAROUSEL_MAX_SLIDES]`

  - [x]* 2.8 Escrever testes de propriedade de isolamento de chaves
    - **Propriedade 20: Isolamento de chaves de persistência**
    - **Valida: Requisito 9.2**
    - Para qualquer operação do carrossel, a chave `'cuscuz-insta-kit:rascunho'` no `localStorage` não deve ser tocada (mock de `localStorage`)

- [x] 3. Checkpoint — Fundação validada
  - Garantir que todos os testes unitários passem com `npm run test`
  - Garantir que `npm run typecheck` não apresenta erros
  - Verificar que o Modo Post Único continua funcionando sem alteração visual

- [x] 4. Persistência e boot (`src/main.tsx` + `src/store/editorStore.ts`)
  - [x] 4.1 Refatorar `src/main.tsx` para lógica de boot com `useCarousel`
    - Criar a função `bootstrap()` assíncrona que executa antes do render
    - Branch `mode === 'carousel'`: chamar `hydrateUserImages()`, `collectAllImageIds`, `reconcileAllSlides`, `collectGarbageImages` e `useEditor.temporal.getState().clear()`
    - Branch `mode === 'single'`: manter o fluxo atual (reconciliação e GC do doc único)
    - Branch `mode === null`: apenas renderizar (o `ModeSelector` será exibido pelo `App.tsx`)
    - Montar o subscriber de sincronização `useEditor → useCarousel.updateActiveSlide` (apenas quando `mode === 'carousel'` e `doc` ou `finish` mudam por referência)
    - _Requisitos: 1.7, 1.8, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2_

  - [x]* 4.2 Escrever testes de propriedade para `sanitizeSlide` (round-trip)
    - **Propriedade 16: Round-trip de serialização do carrossel**
    - **Valida: Requisitos 8.1, 8.8**
    - Para qualquer `SlideData` válido, serializar com `JSON.stringify` e desserializar com `sanitizeSlide` deve retornar um estado semanticamente equivalente (mesmos `doc` e `finish` válidos)

  - [x]* 4.3 Escrever testes de propriedade para ausência de blobs no payload
    - **Propriedade 17: Ausência de blobs no payload persistido**
    - **Valida: Requisito 8.2**
    - Para qualquer estado de carrossel com imagens, o JSON resultante da serialização não deve conter strings base64 longas (comprimento > 1000 começando com `data:image`) nem campos `Blob`

- [x] 5. Tela Inicial — `ModeSelector`
  - [x] 5.1 Criar `src/components/ModeSelector.tsx` e `ModeSelector.module.css`
    - Exibir dois botões: "Post único" e "Carrossel", com microcopy amigável em pt-BR
    - "Post único" → `setMode('single')` e fecha o `ModeSelector`
    - "Carrossel" → exibir seletor de `PostFormat` (três opções: `3:4`, `4:3`, `1:1`) → ao confirmar: `setFormat(f)` + `setMode('carousel')` + `addSlide()`
    - Aplicar estética "caderninho nordestino": sombras sólidas `0 4px 0 #0b0500`, bordas 3px, botões estilo adesivo
    - _Requisitos: 1.1, 1.2, 1.3, 2.1_

  - [x] 5.2 Integrar `ModeSelector` e lógica de modo em `src/App.tsx`
    - Ler `mode` do `useCarousel`
    - Quando `mode === null`: renderizar `<ModeSelector />` (lazy, com `React.Suspense`)
    - Quando `mode === 'single'`: renderizar o layout atual sem `SlideTray`
    - Quando `mode === 'carousel'`: renderizar o layout atual com `<SlideTray />` (lazy) abaixo do `canvasArea`
    - Implementar botão "Trocar modo" no layout: exibir `<ConfirmDialog>` existente → se confirmado, chamar `resetCarousel()` ou `reset()` e `setMode(null)`
    - _Requisitos: 1.2, 1.4, 1.5, 1.6, 9.1, 9.4, 9.5_

  - [x] 5.3 Restaurar modo na inicialização (boot com rascunho salvo)
    - Quando `mode === 'carousel'` no boot: exibir diretamente o editor com carrossel restaurado (Req. 1.7)
    - Quando `mode === 'single'` no boot: exibir diretamente o editor do post único (Req. 1.8)
    - Quando `mode === null`: exibir o `ModeSelector` (nenhum rascunho salvo)
    - _Requisitos: 1.7, 1.8_

- [x] 6. Tira de Miniaturas — `SlideTray`, `SlideThumb` e `useSlideThumb`
  - [x] 6.1 Criar `src/canvas/hooks/useSlideThumb.ts`
    - Implementar cache em memória (`Map<slideId, dataUrl>` e `Map<slideId, hash>`) fora do React
    - Lógica de debounce com `CAROUSEL_THUMB_DEBOUNCE` ms; para slides não-ativos, usar `IntersectionObserver`
    - Para o slide ativo: capturar `stage.toDataURL({ pixelRatio: CAROUSEL_THUMB_WIDTH / displayWidth })` com `mimeType: 'image/webp'`
    - Retornar `string | null` (null enquanto ainda não gerada)
    - _Requisitos: 5.2, 5.3, 5.4, 10.1, 10.2, 10.3_

  - [x] 6.2 Criar `src/components/carousel/SlideThumb.tsx` e `SlideThumb.module.css`
    - Exibir a miniatura (ou placeholder com cor de fundo) na proporção correta do `PostFormat`
    - Exibir badge ordinal (1, 2, 3...) no canto superior esquerdo
    - Destaque visual para slide ativo: borda `3px solid #f8ce2b` e sombra sólida
    - Implementar handlers de drag-and-drop HTML5 nativo: `onDragStart` grava o índice em `dataTransfer`; `onDrop` chama `reorderSlides(from, index)`
    - _Requisitos: 4.7, 5.1, 5.4, 5.5, 3.10_

  - [x] 6.3 Criar `src/components/carousel/SlideTray.tsx` e `SlideTray.module.css`
    - Estrutura horizontal: botão "◄ Anterior", lista de `<SlideThumb />` com scroll, botão "Próximo ►"
    - Fila de controles: "Novo slide", "Duplicar slide ativo", "Remover slide"
    - Botões "Novo" e "Duplicar" desabilitados ao atingir `CAROUSEL_MAX_SLIDES`; Toast: `"Chegou no limite! Um carrossel pode ter até 10 slides 🎠"`
    - Botão "Remover" desabilitado quando `slides.length === 1`; Toast: `"O carrossel precisa ter pelo menos 1 slide 😅"`
    - Passar `stageRef` ao `useSlideThumb` para geração de miniaturas
    - _Requisitos: 3.4, 3.5, 3.9, 4.1, 4.3, 4.4, 4.5, 4.6, 5.1_

- [x] 7. Gerenciamento completo de slides (UX de remoção e confirmações)
  - [x] 7.1 Implementar detecção de slide com conteúdo e `ConfirmDialog` para remoção
    - Criar função auxiliar `isSlideEmpty(slide: SlideData): boolean` — `true` quando `doc.elements` está vazio, `doc.backgroundId` é `null` e `finish` é padrão
    - Em `SlideTray`: ao clicar em "Remover", se `isSlideEmpty` → remove direto; caso contrário → exibe `<ConfirmDialog>` existente antes de chamar `removeSlide`
    - _Requisitos: 3.6, 3.7, 3.8_

  - [x] 7.2 Travar `PostFormat` no Modo Carrossel
    - Em `BackgroundStep` (ou onde o seletor de formato é exibido): quando `mode === 'carousel'`, desabilitar o seletor de formato e exibir o formato vigente como somente leitura
    - Se a usuária tentar interagir: Toast `"O formato não pode ser alterado depois que o carrossel foi criado 🎠"`
    - _Requisitos: 2.3, 2.4_

- [x] 8. Checkpoint — UI do carrossel validada
  - Garantir que `npm run test` passa sem erros
  - Garantir que `npm run typecheck` não apresenta erros
  - Verificar manualmente: criação de carrossel, adição/remoção/duplicação de slides, navegação por miniaturas

- [x] 9. Isolamento de undo/redo por slide
  - [x] 9.1 Implementar `loadSlideIntoEditor` e integrar a troca de slide
    - Criar função auxiliar `loadSlideIntoEditor(slide: SlideData)`:
      1. `useEditor.setState({ doc: slide.doc, finish: slide.finish })`
      2. `useEditor.setState({ step: 0, selectedIds: [], selectedId: null, editingId: null })`
      3. `useEditor.temporal.getState().clear()`
    - Chamar `loadSlideIntoEditor` em `setActiveSlide` do `carouselStore.ts` e em `setMode('carousel')`
    - _Requisitos: 4.8, 6.4, 6.5, 6.6_

  - [x]* 9.2 Escrever testes unitários para `loadSlideIntoEditor`
    - Verificar que o editor recebe `doc` e `finish` corretos
    - Verificar que `step === 0` e `selectedIds === []` após a chamada
    - Verificar que o histórico temporal foi limpo (`temporal.pastStates.length === 0`)
    - _Requisitos: 4.8, 6.5_

- [x] 10. Exportação do Carrossel (`src/lib/exportCarousel.ts` + Header + App)
  - [x] 10.1 Criar `src/lib/exportCarousel.ts`
    - Implementar `exportCarousel(opts: ExportCarouselOptions): Promise<void>` com o algoritmo do design:
      - Para cada slide: `loadSlideIntoEditor` → `await setTimeout(80)` → `ensureFontsLoaded()` → `ensureUserImagesReady(imageIds)` → `stage.toDataURL(...)` → `fetch(dataUrl).blob()` → `zip.file('slide-NN.png', blob)` → `onProgress(i+1, total)`
    - JSZip importado dinamicamente: `const JSZip = (await import('jszip')).default`
    - Nomenclatura com zero-padding de 2 dígitos: `slide-01.png`, ..., `slide-NN.png`
    - Nome do ZIP: `cuscuz-carrossel-YYYY-MM-DD-HHmm.zip` com data/hora local
    - Disparar download via `<a href=... download>` temporário + `URL.revokeObjectURL`
    - Chamar `fireCuteConfetti()` ao final (função existente em `lib/export.ts`)
    - _Requisitos: 7.2, 7.3, 7.4, 7.7, 7.9, 7.10_

  - [x]* 10.2 Escrever testes de propriedade para nomenclatura do ZIP
    - **Propriedade 14: Nomenclatura correta dos arquivos no ZIP**
    - **Valida: Requisito 7.3**
    - Para qualquer `n` entre 1 e `CAROUSEL_MAX_SLIDES`, a função de geração de nomes deve produzir exatamente `['slide-01.png', ..., 'slide-NN.png']` com zero-padding de 2 dígitos

  - [x] 10.3 Adicionar botão "Exportar carrossel" ao `src/components/Header.tsx`
    - Exibir o botão condicionalmente quando `mode === 'carousel'`
    - Desabilitar durante `isExporting === true`
    - Label: `"Exportar carrossel"` (normal) e `"Exportando N de M..."` durante a exportação
    - _Requisitos: 7.1, 7.5, 7.6_

  - [x] 10.4 Integrar `handleExportCarousel` no `src/App.tsx`
    - Implementar `handleExportCarousel` conforme o design (seção 7.3):
      - Chamar `useCarousel.getState().setExporting(...)` antes e `null` no `finally`
      - Esconder guias, desmarcar seleção, desligar edição in-place antes de exportar
      - Restaurar o slide ativo original no `finally` com `loadSlideIntoEditor`
      - Toast de sucesso: `"Carrossel exportado! 🌽 Prontinho pro Insta!"`
      - Toast de erro: `"Erro ao exportar o carrossel 😵 Tente novamente."`
    - _Requisitos: 7.5, 7.6, 7.7, 7.8_

- [x] 11. Code Splitting e otimização de bundle
  - [x] 11.1 Atualizar `vite.config.ts` com chunk para JSZip
    - Acrescentar `carousel: ['jszip']` ao `manualChunks` existente (ao lado de `react` e `konva`)
    - _Requisitos: 9.3, 9.4_

  - [x] 11.2 Converter imports de `ModeSelector` e `SlideTray` para `React.lazy` em `App.tsx`
    - Substituir imports estáticos por `React.lazy(() => import('./components/ModeSelector'))` e `React.lazy(() => import('./components/carousel/SlideTray'))`
    - Envolver cada um em `<React.Suspense fallback={null}>`
    - _Requisitos: 9.4_

- [x] 12. Checkpoint final — Integração completa validada
  - Garantir que `npm run test` passa sem erros
  - Garantir que `npm run typecheck` não apresenta erros
  - Garantir que `npm run build` compila sem erros e gera os chunks esperados (`carousel`, `react`, `konva`)
  - Verificar que a chave `'cuscuz-insta-kit:rascunho'` não é tocada durante operações do carrossel

---

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia os requisitos específicos que valida para rastreabilidade
- O editor existente (`useEditor`, `EditorCanvas`) **não é refatorado** — o `useCarousel` orquestra ao redor dele
- O chunk JSZip só é baixado quando "Exportar carrossel" é acionado pela primeira vez (`import('jszip')` dinâmico)
- Testes de propriedade validam garantias universais; testes unitários cobrem exemplos e casos de borda
- Os testes e2e existentes em `e2e/` cobrem as propriedades de integração (P8, P10, P13, P21) quando aplicável

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "1.6"] },
    { "id": 2, "tasks": ["1.5", "1.7", "1.8", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 4, "tasks": ["4.1", "5.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "5.2", "5.3"] },
    { "id": 6, "tasks": ["6.1", "7.2"] },
    { "id": 7, "tasks": ["6.2", "9.1"] },
    { "id": 8, "tasks": ["6.3", "9.2"] },
    { "id": 9, "tasks": ["7.1", "10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3"] },
    { "id": 11, "tasks": ["10.4"] },
    { "id": 12, "tasks": ["11.1", "11.2"] }
  ]
}
```

# Plano de Implementação: Cuscuz Records Insta Kit

## Visão Geral

O **Cuscuz Records Insta Kit** está completamente implementado. Este documento registra o estado atual das features e serve como ponto de entrada para manutenção e evolução futura. Todas as tasks estão marcadas como concluídas.

**Stack:** React 18 + TypeScript + Vite + Konva.js + Zustand + zundo + IndexedDB + @huggingface/transformers

---

## Tasks

### Feature 1: Etapa 0 — Fundo (`background-step`)

- [x] 1. Implementar galeria de fundos e renderização no canvas
  - [x] 1.1 Galeria de presets com 10 fundos na `BackgroundStep.tsx`
    - 5 fundos estilizados (`bg-pronto-1..5`) + 5 puros (`bg-puro-1..5`)
    - Miniaturas carregadas de `public/brand/thumbs/`
    - _Requisitos: 1.1_

  - [x] 1.2 Renderização do fundo nos 3 formatos em `BackgroundNode.tsx`
    - Formato 3:4: orientação original, cobre a folha sem distorção
    - Formato 4:3: rotação de 90° pivotada no centro, preenchimento 1440×1080 px
    - Formato 1:1: largura 1080 px, recorte vertical respeitando `backgroundOffsetY`
    - _Requisitos: 1.2, 1.3, 1.4, 1.5_

  - [x] 1.3 Deslize vertical do fundo no passo 0
    - Arrasto direto na folha quando `step === 0`
    - Controle deslizante (slider) no painel lateral
    - Botões rápidos "Topo", "Centro" e "Base"
    - _Requisitos: 1.6_

  - [x] 1.4 Travamento do fundo em outros passos
    - `draggable={false}` e `listening={false}` quando `step !== 0`
    - _Requisitos: 1.7_

  - [x] 1.5 Espelhamento H e V centralizado
    - Flip horizontal (↔) e vertical (↕) pivotado no centro da folha
    - Sem vazar margens em nenhuma das direções
    - _Requisitos: 1.8_

  - [x] 1.6 Persistência no Doc e validação de navegação
    - Campos `backgroundId`, `backgroundFlipX`, `backgroundFlipY`, `backgroundOffsetY` no Doc
    - Toast "Escolha um fundo primeiro" ao tentar avançar sem fundo selecionado
    - _Requisitos: 1.9, 1.10_

  - [x]* 1.7 Testes de propriedade para o fundo
    - **Propriedade 2: backgroundOffsetY sempre no intervalo [0, 360]**
    - **Propriedade 3: Flip do fundo é involutório**
    - **Valida: Requisitos 1.6, 1.8**

---

### Feature 2: Etapa 1 — Enfeites e Grafismos (`decoration-step`)

- [x] 2. Implementar painel de enfeites, grafismos e moldura
  - [x] 2.1 Grid de enfeites, grafismos e moldura na `DecorationStep.tsx`
    - Enfeites: `deco-flores`, `deco-folhas-1/2`, `deco-ondas-1/2`, `deco-grade`, `deco-sobrepor`
    - Grafismos: `deco-chain`, `deco-esqueleto`, `deco-mp3player`, `deco-papel-divisao`
    - Moldura: `deco-janela`
    - _Requisitos: 2.1, 2.2, 2.3_

  - [x] 2.2 Inserção de `DecorationEl` e posicionamento inicial centrado
    - Elemento inserido centralizado na folha ao clicar no grid
    - _Requisitos: 2.4_

  - [x] 2.3 Posicionamento rápido por canto com auto-flip
    - Botões de canto (TL/TR/BL/BR) via `DECORATION_ANCHORS` em `brand.ts`
    - Auto-flip para o elemento "abraçar" o canto escolhido
    - _Requisitos: 2.5_

  - [x] 2.4 Blend modes especiais em `DecorationNode.tsx`
    - `deco-grade`: modo `soft-light`
    - `deco-papel-divisao`: modo `divide`
    - _Requisitos: 2.1, 2.2_

  - [x] 2.5 Transformações individuais de enfeites
    - Arrasto livre, resize proporcional, rotação, flipX/Y, reordenação de camadas
    - Remoção individual com suporte a Undo/Redo
    - Múltiplos enfeites do mesmo tipo na mesma folha
    - _Requisitos: 2.6, 2.7, 2.8, 2.9_

---

### Feature 3: Etapa 2 — Imagens do Usuário (`image-step`)

- [x] 3. Implementar importação, armazenamento e transformação de imagens
  - [x] 3.1 Validação de formato e tamanho em `imageRules.ts`
    - Aceita PNG, JPEG, WebP, GIF, AVIF, BMP; rejeita SVG com toast
    - Rejeita arquivos > 25 MB (`IMAGE_MAX_FILE_BYTES`) com toast
    - `isSupportedImageFile`, `isImageFileTooBig`
    - _Requisitos: 3.1, 3.3, 3.4_

  - [x]* 3.2 Testes de propriedade para regras de imagem
    - **Propriedade 4: isSupportedImageFile rejeita SVG e aceita formatos raster**
    - **Propriedade 5: isImageFileTooBig rejeita arquivos acima do limite**
    - **Propriedade 6: downscaleDimensions preserva proporção e respeita o limite**
    - **Propriedade 7: hasImageSlots retorna false quando o limite é atingido**
    - **Valida: Requisitos 3.1, 3.3, 3.4, 3.5, 3.8**

  - [x] 3.3 Pipeline de processamento em `userImages.ts`
    - Downscale para máx 3000 px no maior lado (`IMAGE_MAX_SIDE`)
    - Encode WebP q0.92 com fallback JPEG
    - Geração de miniatura 320 px
    - _Requisitos: 3.5_

  - [x] 3.4 Persistência no IndexedDB e metadados no localStorage
    - Blob + miniatura no IndexedDB (`cuscuz-insta-kit`, store `images`)
    - Apenas `imageId`, dimensões e transformações no Doc
    - _Requisitos: 3.6_

  - [x] 3.5 Fila sequencial de importação (FIFO) em `imageImport.ts`
    - Arquivos processados em série, nunca em paralelo
    - _Requisitos: 3.7_

  - [x] 3.6 Entrada por seletor de arquivo e drag-and-drop
    - Drop no painel lateral e direto na folha (posição nas coordenadas do canvas)
    - _Requisitos: 3.1, 3.2_

  - [x] 3.7 Limite de 5 imagens com bloqueio por toast
    - `hasImageSlots` verificado antes de importar e ao duplicar
    - Toast "Tá lotado! Cabem até 5 imagens por post 😅"
    - _Requisitos: 3.8, 3.10_

  - [x] 3.8 Transformações de `ImageEl` em `ImageNode.tsx`
    - Arrasto, resize proporcional, rotação, flipX/Y, snap, camadas, duplicar, excluir
    - _Requisitos: 3.9_

  - [x] 3.9 Reconciliação e GC no boot
    - `reconcileImages`: remove `ImageEl` sem blob do Doc
    - `collectGarbageImages`: remove blobs órfãos do IndexedDB
    - Blobs de elementos excluídos mantidos durante a sessão para Undo/Redo
    - _Requisitos: 3.11, 3.12, 3.13_

  - [x]* 3.10 Testes de propriedade para reconciliação
    - **Propriedade 8: reconcileImages remove somente os ImageEl sem blob disponível**
    - **Valida: Requisito 3.11**

---

### Feature 4: Remoção de Fundo (`bg-removal`)

- [x] 4. Implementar pipeline client-side de remoção de fundo
  - [x] 4.1 Botão "Remover fundo" e ícone de tesoura na `ImageStep.tsx`
    - Botão no card da imagem selecionada
    - Ícone de tesoura na linha da lista de imagens
    - _Requisitos: 4.1_

  - [x] 4.2 Pipeline BiRefNet_lite em `bgRemoval.ts`
    - Modelo `studioludens/birefnet-lite-512`, fp16 ~94 MB, MIT
    - 100% client-side via `@huggingface/transformers` (WebGPU → fallback wasm/fp32)
    - _Requisitos: 4.2_

  - [x] 4.3 Dois modos de remoção calibrados
    - **Pessoa**: alpha suave com `fbFusionForeground` + `gaussianBlur` para cabelos
    - **Objeto**: máscara firme com `median3x3` + curva estreita + `erode3x3`
    - _Requisitos: 4.3_

  - [x] 4.4 Download único com barra de progresso e cache offline
    - `ensureBgModel` com callback `onProgress`
    - Aviso descritivo antes do download (~94 MB)
    - Modelo cacheado no browser para uso offline posterior
    - _Requisitos: 4.4_

  - [x] 4.5 UX do quadro em `bgRemovalStatus.ts`
    - Botão vira quadro ao ativar; quadro recua ao topo ao desselecionar imagem
    - Somente o X fecha o quadro (clicar fora não fecha)
    - Botão "Cancelar" durante download/inferência; X desabilitado neste período
    - Cancelamento invalida epoch atual; download continua em background
    - Uma inferência por vez
    - Último modo lembrado no localStorage
    - _Requisitos: 4.5, 4.6, 4.7, 4.8, 4.9, 4.13_

  - [x] 4.6 `replaceImage` com preservação de posição e `cutFrom`
    - Preserva posição, rotação e escala do `ImageEl` original
    - Referência à imagem anterior armazenada em `el.cutFrom`
    - Registro via `registerProcessedImage → IndexedDB → replaceImage`
    - _Requisitos: 4.10_

  - [x] 4.7 Encode WebP com alpha e botão "Reverter fundo"
    - Resultado codificado em WebP com canal alpha; fallback PNG (nunca JPEG)
    - Botão "Reverter fundo" visível quando `el.cutFrom` está definido
    - Reversão limpa `cutFrom`, com suporte a Undo/Redo
    - _Requisitos: 4.11, 4.12_

  - [x]* 4.8 Testes de propriedade para replaceImage
    - **Propriedade 9: replaceImage preserva largura visual da imagem**
    - **Propriedade 10: reverter fundo (cutFrom) restaura imageId original**
    - **Valida: Requisitos 4.10, 4.12**

---

### Feature 5: Etapa 3 — Texto (`text-step`)

- [x] 5. Implementar sistema de texto com efeitos e regras da marca
  - [x] 5.1 Três estilos pré-configurados em `TextStep.tsx`
    - **Título**: `Londrina Solid` 900, 120 px, maiúsculas, preto
    - **Destaque**: `Londrina Solid` 900, 80 px, maiúsculas, preto, Efeito da Marca ativo
    - **Texto**: `PT Sans Narrow` bold 700, 44 px, preto
    - Paleta restrita às 6 cores oficiais (`COLORS`)
    - _Requisitos: 5.1, 5.2_

  - [x] 5.2 Efeito da Marca em `TextNode.tsx`
    - Traçado Creme (`#f7ebcd`) 2 px posição externa
    - Sombra preta (`#0b0500`) 46%, ângulo 90°, distância 11 px, blur 4 px
    - Dois passes de renderização: camada stroke+shadow → camada fill
    - _Requisitos: 5.3_

  - [x] 5.3 Bordas de destaque (Amarela e Barro)
    - Borda Amarela (`#f8ce2b`): textura `textura-borda` em `soft-light` 100%
    - Borda Barro (`#942911`): mesma textura em `soft-light` 44%
    - _Requisitos: 5.4_

  - [x] 5.4 Regra Texto ≤ Título em `textRules.ts`
    - `clampTextSize(elements, target, requested)` como única porta de escrita de `fontSize`
    - `enforceTextRule(elements)` como rede de segurança ao commitar transformações
    - Toast "Opa! O texto não pode ficar maior que o título 🙈" ao atingir o limite
    - _Requisitos: 5.5, 5.6, 5.7, 5.8_

  - [x]* 5.5 Testes de propriedade para regras de texto
    - **Propriedade 11: clampTextSize nunca viola a regra Texto ≤ Título**
    - **Propriedade 12: enforceTextRule garante consistência global de fontes**
    - **Valida: Requisitos 5.5, 5.6, 5.7, 5.8, 5.11**

  - [x] 5.6 Edição inline ao duplo clique em `InlineTextEditor.tsx`
    - `<textarea>` sobreposta e sincronizada com o `TextNode` Konva
    - Resposta à escala atual do canvas
    - _Requisitos: 5.9_

  - [x] 5.7 Controles de tipografia completos
    - Slider de `fontSize` (16–320 px)
    - Controles de `lineHeight`, `letterSpacing`, alinhamento H, uppercase
    - _Requisitos: 5.10, 5.11_

---

### Feature 6: Etapa 4 — Logo (`logo-step`)

- [x] 6. Implementar painel de logo com variantes e posicionamento
  - [x] 6.1 Regra de logo única em `LogoStep.tsx`
    - Máximo 1 `LogoEl` por post; adicionar segunda troca a variante sem criar nova
    - Remoção permite adicionar nova logo na mesma sessão
    - _Requisitos: 6.1, 6.7_

  - [x] 6.2 Duas variantes de logo em `LogoNode.tsx`
    - "Com papel" (`logo-paper.webp`) e "Sem fundo" (`logo-clean.webp`)
    - Troca de variante mantém largura visual do `LogoEl`
    - _Requisitos: 6.2, 6.3_

  - [x] 6.3 Tamanhos rápidos P/M/G e 7 posições de encaixe
    - P (200 px), M (320 px), G (460 px) via `LOGO_SIZES`
    - 7 posições: 4 cantos, 2 centros de borda (E/D), centro da folha
    - Margem de `LOGO_MARGIN` (56 px) a partir da borda
    - _Requisitos: 6.4, 6.5_

  - [x] 6.4 Transformações da logo e exportação sem logo
    - Arrasto, resize proporcional, rotação, reordenação de camadas
    - Exportação permitida sem logo sem mensagem de erro
    - _Requisitos: 6.6, 6.8_

---

### Feature 7: Etapa 5 — Textura (`texture-step`)

- [x] 7. Implementar acabamentos texturais opcionais
  - [x] 7.1 Três acabamentos independentes na `TextureStep.tsx`
    - Todos inicializados desativados (`FINISH_ENABLED_DEFAULT = false`)
    - Renderizados via `TextureOverlays.tsx` na camada de sobreposição final
    - _Requisitos: 7.1, 7.2, 7.8_

  - [x] 7.2 Papel amassado e textura de borda com sliders de opacidade
    - Papel amassado: `papel-textura.webp`, opacidade 0–100%, padrão 40%
    - Textura de borda: `textura-borda.webp`, opacidade 0–100%, padrão 40%
    - _Requisitos: 7.3, 7.4_

  - [x] 7.3 Granulado determinístico com `mulberry32` em `grain.ts`
    - Seed fixo `GRAIN_SEED` (20261016), desvio padrão `GRAIN_STDDEV` (30)
    - Intensidade 0–100%, tamanhos P/M/G (`patternScale` 0.5/1/2)
    - Tile 512×512 cacheado por `size:seed`
    - Grão idêntico no preview e na exportação (mesmo seed)
    - _Requisitos: 7.5, 7.6, 7.7_

  - [x]* 7.4 Teste de propriedade para granulado
    - **Propriedade 17: makeGrainData é determinístico para o mesmo seed**
    - **Valida: Requisito 7.7**

---

### Feature 8: Seleção Múltipla (`multiselect`)

- [x] 8. Implementar seleção conjunta e transformações em lote
  - [x] 8.1 Seleção com modificador de teclado em `EditorCanvas.tsx`
    - `Ctrl`, `Cmd` (macOS) ou `Shift` + clique para seleção múltipla
    - Clique com modificador em elemento selecionado o remove da seleção
    - Clique em área vazia sem modificador limpa a seleção
    - _Requisitos: 8.1, 8.2, 8.3_

  - [x] 8.2 Transformer único do Konva para grupo selecionado
    - Um único `Transformer` engloba todos os nós selecionados
    - _Requisitos: 8.4_

  - [x] 8.3 Mover, redimensionar e rotacionar conjunto em `multiSelect.ts`
    - Snap calculado sobre a bounding box de união do grupo
    - Resize proporcional (`keepRatio`) com escala relativa por elemento
    - Rotação em torno do centro comum da bounding box
    - _Requisitos: 8.5, 8.6, 8.7_

  - [x]* 8.4 Testes de propriedade para seleção múltipla
    - **Propriedade 13: toggleId é involutório (round-trip de seleção)**
    - **Propriedade 14: pruneIds remove somente ids ausentes do doc**
    - **Propriedade 15: buildTransformPatches produz resultado que satisfaz enforceTextRule**
    - **Propriedade 16: duplicateGroup respeita IMAGE_MAX_COUNT**
    - **Valida: Requisitos 8.1, 8.2, 8.3, 8.6, 8.8, 8.11**

  - [x] 8.5 Regra Texto ≤ Título no `boundBoxFunc` durante resize em grupo
    - Travamento da escala ao atingir o limite; toast de aviso
    - _Requisitos: 8.8_

  - [x] 8.6 `AlignToolbar` com indicador `N×` e ações em lote
    - Indicador `N×` quando 2+ elementos selecionados
    - Ações: alinhar à página (6 modos), trazer frente, enviar trás, duplicar, excluir
    - Duplicar respeita `IMAGE_MAX_COUNT`; duplicar `LogoEl` ignorado com aviso
    - _Requisitos: 8.9, 8.10, 8.11_

  - [x] 8.7 Atalhos de teclado para seleção múltipla
    - `Delete` (excluir), `Ctrl+D` (duplicar), setas (mover 1 px ou 10 px com Shift)
    - _Requisitos: 8.12_

---

### Feature 9: Exportação e Undo/Redo (`export`)

- [x] 9. Implementar exportação de alta resolução e histórico de ações
  - [x] 9.1 Exportação com pixel ratio exato em `export.ts`
    - `pixelRatio = postWidth / stageDisplayWidth`
    - Dimensões exatas: 1080×1440 (3:4), 1440×1080 (4:3), 1080×1080 (1:1)
    - Guias de layout excluídas do canvas exportado
    - _Requisitos: 9.1, 9.6_

  - [x] 9.2 Pré-carregamento de fontes antes do export em `fonts.ts`
    - `ensureFontsLoaded()` aguarda `document.fonts.ready`
    - `Londrina Solid` e `PT Sans Narrow` auto-hospedadas via `@fontsource`
    - _Requisitos: 9.2_

  - [x] 9.3 Nomenclatura de arquivo e Web Share API
    - Padrão: `cuscuz-post-YYYY-MM-DD-HHmm.png`
    - Web Share API no mobile; fallback download tradicional via `<a download>`
    - _Requisitos: 9.3, 9.4_

  - [x] 9.4 Animação de confete ao exportar
    - `fireCuteConfetti()` com cores da marca após exportação bem-sucedida
    - _Requisitos: 9.5_

  - [x] 9.5 Undo/Redo de 50 passos com debounce em `editorStore.ts`
    - Limite de 50 snapshots, debounce de 400 ms
    - `Ctrl+Z` (Undo), `Ctrl+Shift+Z` e `Ctrl+Y` (Redo) via `shortcuts.ts`
    - _Requisitos: 9.7, 9.8_

  - [x] 9.6 Persistência de rascunho no localStorage
    - Chave `cuscuz-insta-kit:rascunho`: `{ doc: Doc, finish: FinishState }`
    - Sem blobs; escrita com debounce 300 ms + flush no `beforeunload`
    - Recarregado automaticamente ao abrir o editor
    - _Requisitos: 9.9_

  - [x] 9.7 Reconciliação registrada no histórico no boot
    - Após `reconcileImages`, estado inicial consistente desde o começo da sessão
    - _Requisitos: 9.10_

---

### Feature 10: Guias de Layout (`layout-guides`)

- [x] 10. Implementar guias visuais e snap magnético
  - [x] 10.1 Guias de margem, centro e terços em `LayoutGuides.tsx`
    - Linhas de margem (cor Barro `#942911`)
    - Linhas de centro H e V (cor Verde Ceará `#698f3f`)
    - Linhas de terços H e V (cor Preto `#0b0500`)
    - _Requisitos: 10.1, 10.2_

  - [x] 10.2 Margem ajustável com presets rápidos
    - Range 0–160 px, padrão `GUIDE_MARGIN_DEFAULT` (56 px)
    - Presets: 32 px, 56 px, 80 px, 100 px
    - _Requisitos: 10.3, 10.4_

  - [x] 10.3 Snap magnético de 8 px em `SnapGuides.tsx` e `align.ts`
    - `GUIDE_SNAP_THRESHOLD = 8 px` para centro e bordas do elemento arrastado
    - Snap a margens, centro e terços ativos
    - _Requisitos: 10.5_

  - [x]* 10.4 Testes de propriedade para alinhamento e snap
    - **Propriedade 18: snapToGuides retorna deltas dentro do threshold**
    - **Propriedade 19: alignDelta alinha a caixa perfeitamente à página**
    - **Valida: Requisitos 8.10, 10.5**

  - [x] 10.5 Guias excluídas do canvas exportado e alternância de visibilidade
    - Guias renderizadas apenas no preview interativo; fora do `stage.toDataURL`
    - Toggle para ocultar/exibir guias independentemente
    - _Requisitos: 10.6, 10.7_

---

### Feature 11: Formatos de Exportação (`post-format`)

- [x] 11. Implementar seletor de formato e troca dinâmica das dimensões da folha
  - [x] 11.1 Definição dos 3 formatos em `brand.ts` e `types.ts`
    - Vertical (3:4 · 1080×1440 px), Horizontal (4:3 · 1440×1080 px), Quadrado (1:1 · 1080×1080 px)
    - `POST_FORMATS`, `getPostDimensions`, `PostFormat` em `brand.ts`
    - _Requisitos: 11.1_

  - [x] 11.2 Seletor de formato no `Header.tsx`
    - Sempre visível independentemente da etapa ativa
    - _Requisitos: 11.5_

  - [x] 11.3 Troca de formato com preservação do Doc em `editorStore.ts`
    - Reajuste imediato das dimensões da folha no canvas
    - Atualização do `pixelRatio` de exportação
    - Preservação de `backgroundId`, flips, `backgroundOffsetY` e `elements`
    - Formato persistido no Doc serializado no localStorage
    - _Requisitos: 11.2, 11.3, 11.4_

  - [x]* 11.4 Teste de propriedade para round-trip de serialização
    - **Propriedade 1: Round-trip de serialização do Doc**
    - **Valida: Requisitos 1.9, 9.9, 11.4**

---

## Checkpoint Final

- [x] 12. Checkpoint — Todos os testes passando
  - Todos os testes unitários e de propriedade devem estar passando.
  - Executar `npm run test` e `npm run typecheck` de dentro de `insta-kit/`.

---

## Notas

- Tasks marcadas com `*` são opcionais (testes de propriedade e unitários).
- Todas as tasks estão concluídas — o projeto está completamente implementado.
- Cada task referencia requisitos específicos do `requirements.md` para rastreabilidade.
- Novos assets devem passar pelo pipeline `npm run assets` antes de qualquer uso na aplicação.
- Arquivos de blob de imagens do usuário **nunca** vão para o localStorage; apenas metadados.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "11.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 2, "tasks": ["1.7", "2.1", "11.2", "11.3"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "11.4"] },
    { "id": 4, "tasks": ["3.1", "5.1", "6.1", "7.1", "9.1", "10.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "5.2", "5.3", "6.2", "7.2", "9.2", "10.2"] },
    { "id": 6, "tasks": ["3.4", "3.5", "3.6", "5.4", "5.6", "6.3", "7.3", "9.3", "9.5", "10.3"] },
    { "id": 7, "tasks": ["3.7", "3.8", "5.5", "5.7", "6.4", "7.4", "9.4", "9.6", "10.4", "10.5"] },
    { "id": 8, "tasks": ["3.9", "4.1", "8.1", "9.7"] },
    { "id": 9, "tasks": ["3.10", "4.2", "4.3", "8.2", "8.3"] },
    { "id": 10, "tasks": ["4.4", "4.5", "4.6", "8.4", "8.5", "8.6"] },
    { "id": 11, "tasks": ["4.7", "4.8", "8.7"] }
  ]
}
```

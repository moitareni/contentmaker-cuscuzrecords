# Documento de Requisitos — Cuscuz Records Insta Kit

## Introdução

O **Cuscuz Records Insta Kit** é uma aplicação web estática (React 18 + TypeScript + Vite + Konva) que permite à gravadora independente **Cuscuz Records** criar posts para o feed do Instagram nos formatos Vertical 3:4, Horizontal 4:3 e Quadrado 1:1, mantendo 100% de consistência com a identidade visual da marca. A criação segue um fluxo linear de 6 etapas: Fundo → Enfeites → Imagens → Texto → Logo → Textura. Toda a lógica roda no navegador; nenhuma imagem do usuário é enviada a servidores externos.

---

## Glossário

- **Editor**: a aplicação web Cuscuz Records Insta Kit como um todo.
- **Folha**: a área de canvas representando o post a ser gerado, nas dimensões do formato ativo.
- **Formato**: uma das três proporções suportadas — Vertical (3:4 · 1080×1440 px), Horizontal (4:3 · 1440×1080 px) ou Quadrado (1:1 · 1080×1080 px).
- **Fundo**: camada base da Folha, composta por um preset de imagem de marca mais opções de espelhamento e deslize vertical.
- **Preset de Fundo**: um dos 10 assets pré-definidos (`bg-pronto-1..5` e `bg-puro-1..5`) gerados pelo pipeline `npm run assets` e servidos de `public/brand/`.
- **Enfeite**: elemento decorativo da pasta `ENFEITE/`, colocado sobre o Fundo nas etapas de composição.
- **Grafismo**: elemento decorativo da pasta `GRAFISMOS/`, com modo de mesclagem `divide`.
- **Moldura**: a janela retrô (`deco-janela`), disponível na Etapa 2 para emoldurar composições.
- **Elemento**: qualquer nó interativo na Folha — `DecorationEl`, `ImageEl`, `TextEl` ou `LogoEl` (definidos em `src/types.ts`).
- **Doc**: estrutura de dados serializada que representa o estado do post (`src/types.ts → Doc`).
- **Transformer**: componente Konva que envolve um ou mais nós selecionados para transformações interativas.
- **IndexedDB**: banco de dados do navegador (`cuscuz-insta-kit`, store `images`) onde ficam os blobs de imagens do usuário.
- **GC** (Garbage Collector de Órfãos): rotina que remove blobs do IndexedDB sem referência no Doc, executada no boot.
- **Efeito da Marca**: combinação de traçado creme 2 px externo + sombra projetada preta, conforme especificado em `src/brand/brand.ts → BRAND_EFFECT`.
- **Borda de Destaque**: borda retangular ao redor de um elemento de texto, nas variantes Amarela ou Barro, com textura `textura-borda` em `soft-light`.
- **Finish**: conjunto dos três acabamentos da Etapa 6 (papel amassado, textura de borda, granulado), representados em `src/types.ts → FinishState`.
- **Snap**: comportamento magnético que alinha o elemento arrastado a guias de layout ou ao centro da Folha.
- **Undo/Redo**: histórico de 50 passos com debounce de 400 ms, gerenciado pelo Zustand com zundo (`src/store/editorStore.ts`).
- **Paleta Oficial**: as seis cores da marca definidas em `src/brand/brand.ts → COLORS`: Preto `#0b0500`, Barro `#942911`, Amarelo `#f8ce2b`, Amarelo Quente `#f6c01f`, Verde Ceará `#698f3f`, Creme `#f7ebcd`.
- **Pipeline de Assets**: script `scripts/build-assets.mjs` que otimiza imagens de marca e gera `src/assets-manifest.json` e `public/brand/`.
- **BiRefNet_lite**: modelo de remoção de fundo (`studioludens/birefnet-lite-512`, fp16 ~94 MB, MIT) operado 100% no navegador via `@huggingface/transformers`.
- **Mulberry32**: PRNG com seed usado para geração determinística do granulado, garantindo identidade entre preview e exportação.

---

## Requisito 1 — Etapa 0: Fundo (`background-step`)

**User Story:** Como criadora de conteúdo da Cuscuz Records, quero escolher e personalizar o fundo do post para que a arte já parta com a identidade visual certa.

**Arquivos de implementação:** `src/steps/BackgroundStep.tsx`, `src/canvas/BackgroundNode.tsx`, `src/store/editorStore.ts`, `src/brand/brand.ts → POST_FORMATS`.

### Critérios de Aceitação

1. THE Editor SHALL exibir, na Etapa 0, uma galeria de 10 Presets de Fundo — 5 estilizados (`bg-pronto-1..5`) e 5 puros (`bg-puro-1..5`) — carregados a partir de `public/brand/` com miniaturas de `public/brand/thumbs/`.
2. WHEN o usuário seleciona um Preset de Fundo, THE Editor SHALL renderizar o Fundo cobrindo toda a Folha sem distorção, sem margens brancas e sem perda de qualidade.
3. WHILE o Formato ativo for Vertical (3:4), THE Editor SHALL renderizar o Fundo em orientação original, com largura igual a 1080 px e altura mínima de 1440 px.
4. WHILE o Formato ativo for Horizontal (4:3), THE Editor SHALL aplicar o Fundo rotacionado 90° pivotado no centro da Folha, preenchendo 1440×1080 px sem distorção.
5. WHILE o Formato ativo for Quadrado (1:1), THE Editor SHALL renderizar o Fundo com largura de 1080 px e recortar verticalmente o excesso de 360 px, respeitando o `backgroundOffsetY`.
6. WHILE o passo ativo for a Etapa 0 (`step === 0`), THE Editor SHALL permitir que o usuário deslize o Fundo verticalmente por arrasto direto na Folha, pelo controle deslizante, ou pelos botões rápidos "Topo", "Centro" e "Base".
7. WHEN o usuário muda para qualquer etapa diferente de 0 (`step !== 0`), THE Editor SHALL travar o Fundo contra qualquer deslocamento acidental, definindo `draggable={false}` e `listening={false}` no nó do fundo.
8. THE Editor SHALL oferecer botões de espelhamento horizontal (↔) e vertical (↕) que flipem o Fundo pivotado no centro da Folha, sem vazar margens.
9. THE Editor SHALL persistir `backgroundId`, `backgroundFlipX`, `backgroundFlipY` e `backgroundOffsetY` no Doc serializado no localStorage.
10. IF nenhum Preset de Fundo estiver selecionado ao tentar avançar de etapa, THEN THE Editor SHALL exibir a notificação: "Escolha um fundo primeiro".

---

## Requisito 2 — Etapa 1: Enfeites e Grafismos (`decoration-step`)

**User Story:** Como criadora de conteúdo, quero adicionar enfeites e grafismos opcionais sobre o fundo para enriquecer a composição com elementos visuais da marca.

**Arquivos de implementação:** `src/steps/DecorationStep.tsx`, `src/canvas/DecorationNode.tsx`, `src/brand/brand.ts → DECORATION_ANCHORS`.

### Critérios de Aceitação

1. THE Editor SHALL disponibilizar, na Etapa 1, os seguintes Enfeites: `deco-flores`, `deco-folhas-1`, `deco-folhas-2`, `deco-ondas-1`, `deco-ondas-2`, `deco-grade` (blend mode `soft-light`) e `deco-sobrepor`.
2. THE Editor SHALL disponibilizar os seguintes Grafismos: `deco-chain`, `deco-esqueleto`, `deco-mp3player` e `deco-papel-divisao` (blend mode `divide`).
3. THE Editor SHALL disponibilizar a Moldura `deco-janela` como opção adicional na Etapa 1.
4. WHEN o usuário adiciona um Enfeite ou Grafismo, THE Editor SHALL inserir o elemento no Doc como `DecorationEl` e renderizá-lo na Folha com posicionamento inicial centrado.
5. THE Editor SHALL suportar posicionamento rápido por canto (TL, TR, BL, BR), reposicionando o Enfeite e aplicando auto-flip conforme o `DECORATION_ANCHORS` definido em `src/brand/brand.ts`, de forma que o elemento "abrace" o canto escolhido.
6. THE Editor SHALL permitir que o usuário transforme cada Enfeite individualmente: arrasto livre pela Folha, redimensionamento proporcional, rotação, flip horizontal (↔) e flip vertical (↕).
7. THE Editor SHALL suportar ordenação de camadas por elemento: trazer para frente e enviar para trás.
8. THE Editor SHALL permitir que o usuário remova qualquer Enfeite ou Grafismo individualmente, com suporte a Undo/Redo.
9. THE Editor SHALL suportar a adição de múltiplos Enfeites do mesmo tipo na mesma Folha.
10. IF o usuário não adicionar nenhum Enfeite, THEN THE Editor SHALL permitir avançar para a próxima etapa sem mensagem de erro.

---

## Requisito 3 — Etapa 2: Imagens do Usuário (`image-step`)

**User Story:** Como criadora de conteúdo, quero inserir fotos do artista ou produto no post para personalizar a arte com imagens reais.

**Arquivos de implementação:** `src/steps/ImageStep.tsx`, `src/canvas/ImageNode.tsx`, `src/lib/imageImport.ts`, `src/lib/imageRules.ts`, `src/lib/userImages.ts`, `src/lib/imageRules.test.ts`.

### Critérios de Aceitação

1. THE Editor SHALL aceitar imagens nos formatos raster PNG, JPEG, WebP, GIF, AVIF e BMP via seletor de arquivo ou arrastar-e-soltar no painel lateral.
2. THE Editor SHALL aceitar imagens arrastadas diretamente para a Folha, inserindo o elemento no ponto onde o arquivo foi solto, nas coordenadas do espaço da Folha.
3. IF o arquivo submetido for SVG, THEN THE Editor SHALL recusar a imagem e exibir uma mensagem informando que SVG não é suportado.
4. IF o arquivo submetido exceder 25 MB (`IMAGE_MAX_FILE_BYTES`), THEN THE Editor SHALL recusar o arquivo e exibir uma mensagem de tamanho máximo excedido.
5. THE Editor SHALL processar cada imagem aceita através do pipeline: downscale para no máximo 3000 px no maior lado (`IMAGE_MAX_SIDE`), encoding para WebP qualidade 0,92 com fallback JPEG, e geração de miniatura de 320 px.
6. THE Editor SHALL armazenar o blob processado e a miniatura no IndexedDB (`cuscuz-insta-kit`, store `images`) e persistir apenas os metadados (`imageId`, dimensões, transformações) no Doc do localStorage.
7. THE Editor SHALL processar arquivos importados de forma sequencial (fila FIFO), nunca em paralelo.
8. WHILE o número de `ImageEl` no Doc for igual a `IMAGE_MAX_COUNT` (5), THE Editor SHALL bloquear qualquer nova importação e exibir o toast: "Limite de 5 imagens atingido".
9. THE Editor SHALL permitir as seguintes transformações em cada `ImageEl`: arrasto livre, redimensionamento proporcional, rotação, flip horizontal (↔), flip vertical (↕), Snap a guias, reordenação de camadas, duplicação e exclusão.
10. WHEN o usuário duplica um `ImageEl`, THE Editor SHALL verificar o limite de `IMAGE_MAX_COUNT` antes de criar a cópia, e bloquear com toast se o limite estiver atingido.
11. THE Editor SHALL executar a reconciliação do Doc com o IndexedDB no boot, removendo da lista de elementos quaisquer `ImageEl` cujo `imageId` não tenha registro no IndexedDB.
12. THE Editor SHALL executar o GC de órfãos no boot, apagando do IndexedDB todos os blobs sem referência em nenhum `imageId` ou `cutFrom` do Doc.
13. WHEN o usuário apaga um `ImageEl`, THE Editor SHALL manter o blob no IndexedDB durante a sessão para suportar Undo/Redo, sem revogá-lo imediatamente.

---

## Requisito 4 — Remoção de Fundo (`bg-removal`)

**User Story:** Como criadora de conteúdo, quero remover o fundo de uma foto no próprio navegador para destacar o artista ou produto sem precisar de software externo.

**Arquivos de implementação:** `src/steps/ImageStep.tsx`, `src/lib/bgRemoval.ts`, `src/lib/bgRemovalStatus.ts`, `src/lib/bgRemoval.test.ts`.

### Critérios de Aceitação

1. THE Editor SHALL oferecer, para cada `ImageEl` selecionado, um botão "Remover fundo" no card da imagem no painel lateral, e um ícone de tesoura na linha da lista de imagens.
2. THE Editor SHALL executar a remoção de fundo 100% no navegador usando o modelo BiRefNet_lite 512 via `@huggingface/transformers`, sem enviar a imagem a servidores externos.
3. THE Editor SHALL oferecer dois modos de remoção: **Pessoa** (alpha suave para cabelo + decontaminação de cor nas bordas) e **Objeto** (máscara firme com median, curva estreita e erosão), conforme os presets em `src/lib/bgRemoval.ts`.
4. WHEN o modelo BiRefNet_lite não estiver cacheado, THE Editor SHALL exibir aviso descritivo e barra de progresso real durante o download (~94 MB fp16), completar o download antes de iniciar a inferência, e manter o modelo cacheado para uso offline posterior.
5. WHEN a remoção de fundo estiver ativa, THE Editor SHALL transformar o botão "Remover fundo" em um quadro dentro do card da imagem selecionada; WHEN o usuário deselecionar a imagem com o quadro aberto, THE Editor SHALL mover o quadro para o topo do painel sem fechá-lo.
6. THE Editor SHALL fechar o quadro de remoção de fundo exclusivamente pelo botão "X"; clicar fora do quadro não o fecha.
7. WHILE o download ou a inferência estiverem em andamento, THE Editor SHALL desabilitar o botão "X" e exibir o botão "Cancelar".
8. WHEN o usuário clica em "Cancelar", THE Editor SHALL invalidar o fluxo de recorte corrente via época sem interromper o download do modelo em background.
9. THE Editor SHALL processar apenas uma inferência por vez; solicitações simultâneas não são permitidas.
10. WHEN a remoção de fundo é concluída com sucesso, THE Editor SHALL registrar a imagem recortada pelo pipeline `registerProcessedImage → IndexedDB → replaceImage`, preservando posição, rotação e escala do `ImageEl` original, e armazenar a referência à imagem anterior em `el.cutFrom`.
11. THE Editor SHALL codificar a imagem resultante em WebP com canal alpha; fallback em PNG. JPEG nunca deve ser usado para imagens com fundo removido.
12. WHEN `el.cutFrom` estiver definido, THE Editor SHALL exibir o botão "Reverter fundo", que substitui a imagem recortada pela original e limpa `el.cutFrom`, com suporte a Undo/Redo.
13. THE Editor SHALL lembrar o último modo de remoção utilizado (Pessoa ou Objeto) em `localStorage`.

---

## Requisito 5 — Etapa 3: Texto (`text-step`)

**User Story:** Como criadora de conteúdo, quero adicionar e estilizar textos no post com a tipografia e efeitos oficiais da marca para garantir consistência visual.

**Arquivos de implementação:** `src/steps/TextStep.tsx`, `src/canvas/TextNode.tsx`, `src/canvas/InlineTextEditor.tsx`, `src/lib/textRules.ts`, `src/lib/textRules.test.ts`, `src/brand/brand.ts → TEXT_PRESETS, BRAND_EFFECT, BORDERS`.

### Critérios de Aceitação

1. THE Editor SHALL disponibilizar três estilos de texto pré-configurados: **Título** (`Londrina Solid` peso 900, 120 px, maiúsculas, preto), **Destaque** (`Londrina Solid` peso 900, 80 px, maiúsculas, preto, Efeito da Marca ativo) e **Texto** (`PT Sans Narrow` bold 700, 44 px, preto).
2. THE Editor SHALL restringir a paleta de cores de texto às 6 cores oficiais da Paleta Oficial (`src/brand/brand.ts → COLORS`).
3. WHEN o Efeito da Marca estiver ativado, THE Editor SHALL renderizar o texto com traçado na cor Creme (`#f7ebcd`) de 2 px em posição externa e sombra projetada na cor Preta (`#0b0500`) com opacidade 46%, ângulo 90°, distância 11 px e desfoque 4 px, conforme `BRAND_EFFECT`.
4. THE Editor SHALL oferecer a Borda Amarela (`#f8ce2b`) com textura `textura-borda` em blend mode `soft-light` à opacidade 100%, e a Borda Barro (`#942911`) com a mesma textura em `soft-light` à opacidade 44%, conforme `BORDERS`.
5. WHILE houver pelo menos um `TextEl` do estilo `title` ou `highlight` no Doc, THE Editor SHALL impedir que qualquer `TextEl` do estilo `body` tenha `fontSize` maior que o menor `fontSize` dentre os elementos `title` e `highlight` presentes.
6. WHILE não houver nenhum `TextEl` do estilo `title` ou `highlight` no Doc, THE Editor SHALL limitar o `fontSize` de `TextEl` do estilo `body` a no máximo 72 px (`BODY_MAX_WITHOUT_HEADING`).
7. WHEN o usuário tenta aumentar o `fontSize` de um `TextEl` do estilo `body` acima do limite, THE Editor SHALL travar no valor máximo permitido e exibir a notificação: "Opa! O texto não pode ficar maior que o título 🙈".
8. THE Editor SHALL impedir que um `TextEl` do estilo `title` ou `highlight` seja reduzido abaixo do maior `fontSize` de qualquer `TextEl` do estilo `body` presente no Doc.
9. THE Editor SHALL suportar edição inline ao duplo clique no `TextEl` na Folha, exibindo o `InlineTextEditor` posicionado sobre o nó e respeitando a escala atual do canvas.
10. THE Editor SHALL oferecer controles de `fontSize` (16–320 px, `FONT_SIZE_MIN`–`FONT_SIZE_MAX`), `lineHeight`, `letterSpacing`, alinhamento horizontal (esquerda, centro, direita) e alternância de maiúsculas (uppercase).
11. THE Editor SHALL limitar `fontSize` ao intervalo `[FONT_SIZE_MIN, FONT_SIZE_MAX]` = [16, 320] px em todos os cenários de redimensionamento.

---

## Requisito 6 — Etapa 4: Logo (`logo-step`)

**User Story:** Como criadora de conteúdo, quero adicionar a logo da Cuscuz Records ao post com controle de tamanho e posicionamento para finalizar a identidade da arte.

**Arquivos de implementação:** `src/steps/LogoStep.tsx`, `src/canvas/LogoNode.tsx`, `src/brand/brand.ts → LOGO_SIZES, LOGO_MARGIN`.

### Critérios de Aceitação

1. THE Editor SHALL limitar a presença de logo a **1 `LogoEl` por post**; tentar adicionar uma segunda logo enquanto uma já existe deve ser ignorado.
2. THE Editor SHALL disponibilizar duas variantes de logo: **Com papel** (`logo-paper.webp`) e **Sem fundo** (`logo-clean.webp`).
3. WHEN o usuário troca a variante da logo, THE Editor SHALL manter a largura visual do `LogoEl` sem redimensioná-la.
4. THE Editor SHALL oferecer três tamanhos rápidos: **P** (200 px), **M** (320 px) e **G** (460 px), conforme `LOGO_SIZES`.
5. THE Editor SHALL oferecer 7 posições rápidas de encaixe para a logo: 4 cantos, 2 centros de borda (esquerda, direita) e centro da Folha, com margem de `LOGO_MARGIN` (56 px) a partir da borda da Folha.
6. THE Editor SHALL permitir as seguintes transformações na logo: arrasto livre, redimensionamento proporcional, rotação e reordenação de camadas.
7. IF o usuário remover a logo, THEN THE Editor SHALL permitir adicionar uma nova logo na mesma sessão.
8. IF o usuário não adicionar nenhuma logo, THEN THE Editor SHALL permitir exportar o post sem logo e sem mensagem de erro.

---

## Requisito 7 — Etapa 5: Textura (`texture-step`)

**User Story:** Como criadora de conteúdo, quero aplicar acabamentos texturais opcionais ao post para dar profundidade e acabamento artesanal à arte final.

**Arquivos de implementação:** `src/steps/TextureStep.tsx`, `src/canvas/TextureOverlays.tsx`, `src/lib/grain.ts`, `src/lib/grain.test.ts`, `src/brand/brand.ts → GRAIN_SEED, GRAIN_TILE_SIZE, PAPER_OPACITY_DEFAULT, BORDER_TEXTURE_OPACITY_DEFAULT, GRAIN_INTENSITY_DEFAULT, GRAIN_SIZES`.

### Critérios de Aceitação

1. THE Editor SHALL oferecer três acabamentos independentes na Etapa 5: **Papel amassado** (overlay de `papel-textura.webp`), **Textura de borda** (overlay de `textura-borda.webp`) e **Granulado** (grão gaussiano gerado via Mulberry32).
2. THE Editor SHALL inicializar todos os três acabamentos desativados (`FINISH_ENABLED_DEFAULT = false`); nenhum acabamento deve ser ativado automaticamente ao criar ou carregar um post.
3. THE Editor SHALL permitir que o usuário ajuste a opacidade do Papel amassado no intervalo 0–100% (`PAPER_OPACITY_MIN`–`PAPER_OPACITY_MAX`), com valor padrão de 40% (`PAPER_OPACITY_DEFAULT`).
4. THE Editor SHALL permitir que o usuário ajuste a opacidade da Textura de borda no intervalo 0–100% (`BORDER_TEXTURE_OPACITY_MIN`–`BORDER_TEXTURE_OPACITY_MAX`), com valor padrão de 40% (`BORDER_TEXTURE_OPACITY_DEFAULT`).
5. THE Editor SHALL permitir que o usuário ajuste a intensidade do Granulado no intervalo 0–100% (`GRAIN_INTENSITY_MIN`–`GRAIN_INTENSITY_MAX`), com valor padrão de 50% (`GRAIN_INTENSITY_DEFAULT`).
6. THE Editor SHALL disponibilizar três tamanhos de grão: **P** (fino, `patternScale` 0,5), **M** (médio, `patternScale` 1) e **G** (grosso, `patternScale` 2), com padrão **P** (`GRAIN_SIZE_DEFAULT`).
7. THE Editor SHALL gerar o Granulado com distribuição gaussiana usando o PRNG Mulberry32 inicializado com o seed fixo `GRAIN_SEED` (20261016) e desvio padrão `GRAIN_STDDEV` (30), garantindo que o grão seja **idêntico** no preview interativo e na exportação.
8. THE Editor SHALL renderizar os acabamentos ativos sobre toda a Folha na camada de sobreposição final, acima de todos os Elementos, via `src/canvas/TextureOverlays.tsx`.

---

## Requisito 8 — Seleção Múltipla (`multiselect`)

**User Story:** Como criadora de conteúdo, quero selecionar e transformar vários elementos ao mesmo tempo para agilizar o reposicionamento e alinhamento de grupos.

**Arquivos de implementação:** `src/lib/multiSelect.ts`, `src/lib/multiSelect.test.ts`, `src/canvas/EditorCanvas.tsx`.

### Critérios de Aceitação

1. THE Editor SHALL iniciar a seleção múltipla quando o usuário clicar em um Elemento na Folha enquanto mantém pressionada a tecla `Ctrl`, `Cmd` (macOS) ou `Shift`.
2. WHEN o usuário clica com modificador em um Elemento já selecionado, THE Editor SHALL remover esse Elemento da seleção múltipla.
3. WHEN o usuário clica em qualquer área vazia da Folha sem modificador, THE Editor SHALL limpar a seleção.
4. THE Editor SHALL usar um único Transformer do Konva para englobar todos os Elementos selecionados simultaneamente.
5. THE Editor SHALL permitir mover o conjunto selecionado com Snap calculado sobre a caixa de união (bounding box) de todos os Elementos selecionados.
6. THE Editor SHALL permitir redimensionamento proporcional (`keepRatio`) do conjunto selecionado, calculando a escala relativa de cada Elemento em relação à caixa de união do grupo.
7. THE Editor SHALL permitir rotação em torno do centro comum da caixa de união do grupo.
8. WHILE o redimensionamento em grupo estiver ativo e o limite `Texto ≤ Título` for atingido para algum `TextEl` do conjunto, THE Editor SHALL travar a escala no `boundBoxFunc` e exibir o toast de aviso correspondente.
9. THE Editor SHALL exibir a `AlignToolbar` com um indicador `N×` quando dois ou mais Elementos estiverem selecionados, onde `N` é o número de Elementos selecionados.
10. WHILE múltiplos Elementos estiverem selecionados, THE Editor SHALL disponibilizar as seguintes ações na `AlignToolbar`: alinhar à página (esquerda, centro H, direita, topo, centro V, base), trazer para frente, enviar para trás, duplicar e excluir.
11. WHEN o usuário aciona duplicar com múltiplos Elementos selecionados, THE Editor SHALL respeitar o limite `IMAGE_MAX_COUNT` para `ImageEl` e exibir toast de aviso se o limite for atingido; uma `LogoEl` duplicada deve ser ignorada com aviso.
12. THE Editor SHALL aplicar os atalhos `Delete` (excluir), `Ctrl+D` (duplicar) e teclas direcionais (mover 1 px ou 10 px com `Shift`) a todos os Elementos selecionados.

---

## Requisito 9 — Exportação e Undo/Redo (`export`)

**User Story:** Como criadora de conteúdo, quero exportar o post em alta resolução nas dimensões exatas do formato escolhido e desfazer/refazer ações enquanto edito, para ter controle total sobre a criação.

**Arquivos de implementação:** `src/lib/export.ts`, `src/lib/fonts.ts`, `src/lib/shortcuts.ts`, `src/store/editorStore.ts`.

### Critérios de Aceitação

1. THE Editor SHALL exportar a Folha com `pixelRatio` calculado para produzir exatamente as dimensões do Formato ativo: 1080×1440 px (3:4), 1440×1080 px (4:3) ou 1080×1080 px (1:1).
2. THE Editor SHALL garantir que todas as fontes (`Londrina Solid` e `PT Sans Narrow`) estejam completamente carregadas — via `src/lib/fonts.ts` — antes de iniciar a renderização de exportação.
3. THE Editor SHALL nomear o arquivo exportado com o padrão `cuscuz-post-YYYY-MM-DD-HHmm.png`, usando a data e hora locais do momento da exportação.
4. WHEN o dispositivo suportar a Web Share API e o formato for compatível, THE Editor SHALL acionar a Web Share API para compartilhamento nativo; em caso de não suporte ou recusa, THE Editor SHALL realizar o download tradicional do arquivo.
5. WHEN a exportação for concluída com sucesso, THE Editor SHALL exibir uma animação de confete comemorativo.
6. THE Editor SHALL excluir as Guias de Layout do canvas exportado; somente Fundo, Elementos e Acabamentos devem aparecer na imagem exportada.
7. THE Editor SHALL manter um histórico de Undo/Redo de 50 passos, com debounce de 400 ms para agrupar mudanças contínuas, gerenciado pelo zundo no `editorStore`.
8. THE Editor SHALL suportar os atalhos `Ctrl+Z` (Undo) e `Ctrl+Shift+Z` ou `Ctrl+Y` (Redo) para navegar pelo histórico.
9. THE Editor SHALL persistir o Doc (apenas metadados, sem blobs) e o `FinishState` no `localStorage` como rascunho da sessão, recarregando-o automaticamente ao abrir o Editor.
10. IF a reconciliação com o IndexedDB no boot remover `ImageEl` do Doc, THEN THE Editor SHALL registrar a remoção no histórico de forma que o estado carregado seja consistente desde o início da sessão.

---

## Requisito 10 — Guias de Layout (`layout-guides`)

**User Story:** Como criadora de conteúdo, quero ver guias de alinhamento estilo Photoshop na Folha para posicionar os elementos com precisão e consistência.

**Arquivos de implementação:** `src/canvas/LayoutGuides.tsx`, `src/canvas/SnapGuides.tsx`, `src/brand/brand.ts → GUIDE_MARGIN_DEFAULT, GUIDE_MARGIN_PRESETS, GUIDE_SNAP_THRESHOLD, GUIDE_COLORS`.

### Critérios de Aceitação

1. THE Editor SHALL exibir guias de layout sobrepostas à Folha compreendendo: linhas de margem, linhas de centro horizontal e vertical, e linhas de terços horizontais e verticais.
2. THE Editor SHALL colorir as guias conforme `GUIDE_COLORS`: margem em Barro (`#942911`), centro em Verde Ceará (`#698f3f`) e terços em Preto (`#0b0500`).
3. THE Editor SHALL inicializar a margem das guias com o valor padrão `GUIDE_MARGIN_DEFAULT` (56 px) e permitir ajuste no intervalo `[GUIDE_MARGIN_MIN, GUIDE_MARGIN_MAX]` = [0, 160] px.
4. THE Editor SHALL oferecer os presets rápidos de margem: 32 px, 56 px, 80 px e 100 px (`GUIDE_MARGIN_PRESETS`).
5. THE Editor SHALL aplicar Snap magnético (`GUIDE_SNAP_THRESHOLD` = 8 px) quando o centro ou as bordas do Elemento arrastado estiverem dentro de 8 px de qualquer guia ativa, incluindo margens, centro e terços.
6. THE Editor SHALL excluir todas as guias do canvas exportado; as guias são renderizadas exclusivamente no preview interativo.
7. THE Editor SHALL permitir que o usuário oculte ou exiba as guias independentemente das demais configurações do Editor.

---

## Requisito 11 — Formatos de Exportação e Troca de Formato (`post-format`)

**User Story:** Como criadora de conteúdo, quero alternar entre os formatos Vertical, Horizontal e Quadrado a qualquer momento para adaptar o mesmo post a diferentes enquadramentos do feed.

**Arquivos de implementação:** `src/brand/brand.ts → POST_FORMATS, getPostDimensions`, `src/store/editorStore.ts`, `src/types.ts → Doc`.

### Critérios de Aceitação

1. THE Editor SHALL suportar três Formatos: Vertical (3:4 · 1080×1440 px), Horizontal (4:3 · 1440×1080 px) e Quadrado (1:1 · 1080×1080 px), definidos em `POST_FORMATS`.
2. WHEN o usuário troca o Formato, THE Editor SHALL reajustar imediatamente as dimensões da Folha no canvas e atualizar o `pixelRatio` de exportação de acordo com as novas dimensões.
3. WHEN o Formato for alterado, THE Editor SHALL preservar o `backgroundId`, `backgroundFlipX`, `backgroundFlipY`, `backgroundOffsetY` e todos os `elements` do Doc sem reinicializá-los.
4. THE Editor SHALL persistir o Formato ativo no Doc serializado no `localStorage`.
5. THE Editor SHALL exibir o seletor de Formato no cabeçalho do Editor, sempre visível independentemente da etapa ativa.

---

## Requisitos Não Funcionais

### Desempenho

- NF-1: THE Editor SHALL manter o bundle JavaScript inicial abaixo de 500 kB comprimido (gzip), usando lazy loading para painéis de etapas e splitting de módulos pesados (ex.: `@huggingface/transformers`).
- NF-2: THE Editor SHALL pré-carregar as fontes `Londrina Solid` e `PT Sans Narrow` via `@fontsource` para garantir renderização correta no primeiro frame e na exportação offline.
- NF-3: THE Editor SHALL servir todos os assets de marca em formato WebP lossless a partir de `public/brand/`, gerados pelo script `scripts/build-assets.mjs`.

### Privacidade e Segurança

- NF-4: THE Editor SHALL processar todas as imagens do usuário exclusivamente no navegador; nenhuma imagem, blob ou dado pessoal deve ser enviado a servidores externos em nenhuma circunstância.
- NF-5: THE Editor SHALL armazenar blobs de imagens exclusivamente no IndexedDB; o `localStorage` deve conter apenas metadados serializáveis (sem binários, sem base64 de imagens).

### Consistência Visual

- NF-6: THE Editor SHALL restringir todas as cores utilizáveis nos Elementos à Paleta Oficial de 6 cores (`src/brand/brand.ts → COLORS`); nenhuma cor fora da paleta deve ser exposta ao usuário.
- NF-7: THE Editor SHALL usar exclusivamente as fontes `Londrina Solid` (headlines) e `PT Sans Narrow` (corpo), ambas auto-hospedadas via `@fontsource`, sem dependência de serviços externos de fontes.

### Experiência do Usuário

- NF-8: THE Editor SHALL exibir mensagens de notificação (toasts) em tom caloroso e descontraído em Português do Brasil, sem diminutivos nos títulos de etapas.
- NF-9: THE Editor SHALL funcionar corretamente offline após o primeiro carregamento (incluindo o cache do modelo BiRefNet_lite), com exceção do download inicial do modelo.
- NF-10: THE Editor SHALL suportar Undo/Redo para todas as ações de criação, edição, movimentação, redimensionamento, rotação, exclusão e importação de Elementos.

### Deploy e Infraestrutura

- NF-11: THE Editor SHALL ser deployado como site estático na Vercel com as seguintes políticas de cache definidas em `vercel.json` e `public/_headers`: `/assets/*` imutável (1 ano, Cache-Control: `public, max-age=31536000, immutable`) e `/brand/*` com revalidação de 7 dias (`public, max-age=604800, stale-while-revalidate=86400`).

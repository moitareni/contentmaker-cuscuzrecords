# Diretrizes para Agentes de IA — Cuscuz Records Insta Kit

Este documento estabelece o contexto do negócio, regras inquebráveis de identidade visual, arquitetura de software e convenções para quaisquer agentes ou desenvolvedores que trabalhem neste repositório.

---

## 1. Contexto do Projeto

O **Cuscuz Records Insta Kit** é uma aplicação web estática criada sob medida para a gravadora independente **Cuscuz Records**.
O objetivo é permitir que o cliente crie de forma prática, rápida e intuitiva posts para o feed do Instagram no formato **3:4 (1080×1440)**, mantendo 100% de consistência com a identidade visual da marca.

---

## 2. Regras Inegociáveis da Marca

### 2.1 Formato e Fundo
- **Formato fixo**: sempre **3:4** (resolução padrão de exportação: **1080×1440 px**).
- **Fundo travado**: o fundo cobre a folha inteira e **nunca** pode ser deslocado pelo usuário para evitar bordas vazias.

### 2.2 Paleta de Cores Oficial
Somente as seguintes cores podem ser utilizadas na arte e nos textos:
- **Amarelo**: `#f8ce2b`
- **Amarelo Quente**: `#f6c01f`
- **Barro**: `#942911`
- **Preto**: `#0b0500`
- **Verde Ceará**: `#698f3f`
- **Creme**: `#f7ebcd` (utilizado no traçado e tons de apoio)

### 2.3 Tipografia
- **Títulos e Destaques (Headlines)**: `Londrina Solid`, peso `900` (Black).
- **Textos de Apoio / Corpo (Body)**: `PT Sans Narrow`, peso `bold` (700) ou `regular` (400).
- **Fontes auto-hospedadas**: carregadas via `@fontsource` para garantir funcionamento offline e exportação de alta fidelidade sem depender de serviços externos.

### 2.4 Efeitos de Texto da Marca (Photoshop Replication)
Quando o "Efeito da Marca" está ativo em títulos:
- **Traçado**: cor `#f7ebcd`, largura visível de `2px`, posição externa.
- **Sombra projetada**: cor `#0b0500` (Preto), opacidade `46%`, ângulo de 90° (direção vertical para baixo), distância `11px`, desfoque `4px`.
- Implementado em Canvas sobrepondo a camada preenchida sobre a camada contornada com sombra, preservando os cantos internos da tipografia.

### 2.5 Bordas de Destaque
- **Borda 1 (Amarela)**: offset retangular contornando o texto na cor `#f8ce2b`, com a textura `textura-borda` recortada nos limites da borda e aplicada no modo de mesclagem `soft-light` ("luz indireta") com 100% de opacidade.
- **Borda 2 (Barro)**: mesmo offset na cor `#942911`, com a textura no modo `soft-light` e 44% de opacidade.

### 2.6 Regra do Tamanho do Texto (`Texto ≤ Título`)
- O tamanho efetivo de qualquer elemento de texto do tipo **Texto** (corpo) **nunca** pode ultrapassar o tamanho do menor **Título** ou **Destaque** presente no post.
- Caso não haja nenhum título no post, o tamanho do texto é limitado a no máximo **72px**.
- Caso o usuário tente aumentar o texto acima do limite (seja pelo slider ou redimensionando pela alça), o sistema trava no valor máximo permitido e emite a notificação amigável:
  > *"Opa! O texto não pode ficar maior que o título 🙈"*
- Da mesma forma, títulos não podem ser encolhidos abaixo do maior texto existente.

### 2.7 Logo e Enfeites
- **Enfeites são opcionais**: o usuário pode adicionar quantos desejar ou nenhum.
- **Logo é opcional**: só aparece se o usuário decidir adicionar. Apenas uma logo é permitida por post, podendo alternar entre "Com papel" e "Sem fundo".

### 2.8 Textura Final (opcional, desligada por padrão)
- Etapa **6. Textura** com dois acabamentos independentes:
  - **Papel amassado**: overlay da textura `TEXTURE/` (`public/brand/papel-textura.webp`) sobre a folha, com opacidade regulável (sugestão: 40%).
  - **Granulado**: grão monocromático com distribuição gaussiana, gerado por RNG **com seed** (`mulberry32`) para o grão ficar **idêntico no preview e no export**.
- Ambos vêm checagem desligada; nunca devem ser aplicados automaticamente na criação de um post.

### 2.9 Imagens do Usuário (etapa 3, opcional)
- **Limite total: até `IMAGE_MAX_COUNT` (5) imagens por post**, contando duplicatas; a 6ª é bloqueada com toast amigável.
- Entrada por seletor de arquivos ou **arrastar e soltar** no painel e direto **na folha** (a imagem nasce no ponto do drop, em coordenadas 1080×1440).
- Mesmas transformações dos outros elementos: drag, resize proporcional, rotação, flip ↔/↕, snap, camadas, duplicar (respeita o limite), apagar e undo/redo.
- **Persistência**: só os metadados (imageId, dimensões, transformações) vão no doc/localStorage; o **binário processado + miniatura ficam no IndexedDB** (`cuscuz-insta-kit` / store `images`) — **nunca** guardar foto em base64 no localStorage (estoura cota e trava a UI).
- Pipeline: raster (png/jpeg/webp/gif/avif/bmp; **SVG recusado**), máx. 25 MB, downscale para no máximo 3000 px no maior lado, encode WebP q0.92 com fallback JPEG, miniatura de 320 px, fila sequencial de importação.
- Ao remover, o blob **não** é apagado na hora (undo precisa dele); GC de órfãos roda no boot, junto com a reconciliação do doc.

### 2.10 Remoção de fundo (etapa 3, opcional)
- **Sempre explícita, nunca automática** (mesma regra das texturas): botão "Remover fundo" no
  card da imagem selecionada + tesourinha em cada linha da lista. Dois modos calibrados —
  **Pessoa** (alpha suave p/ cabelo + decontamination de cor nas bordas) e **Objeto**
  (máscara firme: median + curva estreita + erosão) — presets em `src/lib/bgRemoval.ts`.
- **100% client-side** (fotos nunca saem do navegador): BiRefNet_lite re-exportado a 512²
  (`studioludens/birefnet-lite-512`, fp16 ≈ 94MB, MIT) via `@huggingface/transformers`
  (WebGPU → fallback wasm/fp32). Download **único** na primeira utilização, com aviso e
  barra de progresso reais; depois fica cacheado e funciona offline. Créditos no `README.md`.
- O recorte entra pelo mesmo pipeline de imagens: `registerProcessedImage` → IndexedDB →
  `replaceImage` (preserva posição/rotação/escala; undo/redo grátis; duplicatas não são
  afetadas; a versão anterior vira órfã e sai no GC do boot). Encode: WebP com alpha,
  fallback PNG — **nunca JPEG**. `replaceImage` guarda a imagem anterior em `el.cutFrom`
  (persistida no doc e preservada pelo GC) — o botão **"Reverter fundo"** troca de volta
  pra original e limpa o `cutFrom`.
- UX (ver `bgRemovalStatus.ts` + `ImageStep.tsx`): o **botão "Remover fundo" vira o quadro
  dentro do card**; se a imagem alvo for deselecionada com o quadro aberto, ele recua pro
  topo do painel — clique fora NUNCA fecha, **só o X fecha**. Durante download/recorte o X
  desativa e entra o botão **"Cancelar"** (invalida o fluxo via época; o download da
  ferramenta continua em background p/ acelerar a próxima). Uma inferência por vez; último
  modo lembrado em `localStorage`.

---

## 3. Estrutura do Repositório

```
post-generator/
├── AGENTS.md                   # Este manual
├── INICIAR-CUSCUZ.bat          # Instalador/launcher de 1 clique para a cliente
│                               #   (npm install → npm run assets → npm run dev + abre o navegador)
├── BACKGROUNDS PRESETS/        # Fundos estilizados originais
├── BACKGROUND PUROS/           # Fundos texturizados puros originais
├── BORDER/                     # Textura de borda original
├── CORES/                      # Instruções de paleta
├── DETALHES DE BORDA/          # Enfeites florais e ondas originais
├── LOGO/                       # Logos oficiais originais
├── TYPOGRAPHY/                 # Orientações tipográficas
├── TEXTURE/                    # Textura de papel amassado original (usada pela Etapa 5)
└── insta-kit/                  # Aplicação Web (React + TS + Vite + Konva)
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── vercel.json             # Cache-Control de /assets e /brand no deploy da Vercel
    ├── playwright.config.ts
    ├── scripts/
    │   └── build-assets.mjs    # Pipeline de otimização lossless e geração de manifest
    ├── e2e/
    │   ├── flow.spec.ts        # Fluxo completo de criação (Playwright)
    │   └── image.spec.ts       # Etapa 3: imagens do usuário (upload/drop, limite 5, export)
    ├── public/
    │   └── brand/              # Assets WebP otimizados gerados pelo script (+ thumbs/ para a UI)
    └── src/
        ├── brand/brand.ts      # Definições centrais da marca (cores, fontes, presets, limites)
        ├── store/editorStore.ts# Estado global Zustand + zundo (undo/redo) + persistência
        ├── theme/              # tokens.css e global.css (design tokens da UI)
        ├── types.ts            # Tipos compartilhados do editor (6 etapas, El, ImageEl)
        ├── assets.ts           # Acesso tipado ao assets-manifest.json gerado
        ├── lib/                # Regras de alinhamento, limites de texto, export, atalhos,
        │                       #   grão, zoom, estilo do editor inline e IMAGENS DO USUÁRIO
        │                       #   (imageRules.ts, imageImport.ts, userImages.ts/IndexedDB)
        │                       #   e REMOÇÃO DE FUNDO client-side (bgRemoval.ts, bgRemovalStatus.ts)
        ├── canvas/             # Componentes Konva (EditorCanvas, Nodes incl. ImageNode, Snap,
        │                       #   guias de layout, overlays de textura e editor de texto in-line)
        ├── components/         # Header, Stepper, StepFooter, Toolbars, Toast, ConfirmDialog
        │   └── ui/             # Design system (Button, IconButton, Card, Slider, Segmented…)
        └── steps/              # Painéis das 6 etapas: Fundo, Enfeites, Imagem, Texto, Logo, Textura
```

---

## 4. Comandos e Workflows

Para a cliente (sem linha de comando): basta **duplo clique em `INICIAR-CUSCUZ.bat`**, na raiz.
Ele checa o Node.js, instala dependências, gera os assets e sobe o `npm run dev` abrindo o
navegador automaticamente (procura uma porta livre entre 5173 e 5180).

Para desenvolvimento, os comandos são executados a partir do diretório `insta-kit/`:

```powershell
cd "insta-kit"

# 1. Pipeline de otimização de assets (lê as pastas da raiz e gera public/brand)
npm run assets

# 2. Executar em modo de desenvolvimento local
npm run dev

# 3. Executar testes de unidade e regras (Vitest)
npm run test

# 4. Checagem estrita de tipos TypeScript
npm run typecheck

# 5. Compilação para produção
npm run build

# 6. Testes end-to-end (Playwright)
npm run e2e

# 7. Servidor de prévia do build de produção (porta 4173)
npm run preview
```

---

## 5. Diretrizes de Código e UI

- **Estética da UI**: "Caderninho de receitas nordestino", fofa, com sombras sólidas (`0 4px 0 #0b0500`), bordas de 3px, botões estilo adesivo com micro-interações de pressão.
- **Microcopy**: Tom caloroso, amigável e descontraído em Português do Brasil ("Bora!", "Prontinho!", "Enfeita aí!", "Opa!").
  **Sem diminutivos nos títulos das etapas**: "1. Escolha o fundo" (não "fundinho") — o mesmo vale para toasts que repetem a instrução ("Escolha um fundo primeiro").
- **Performance**: Manter o bundle leve, imagens sempre em WebP lossless, lazy loading de painéis e fontes pré-carregadas.
- **Arquivos grandes do usuário**: vão para o IndexedDB, nunca para o localStorage (o doc persistido
  carrega apenas metadados; ver seção 2.9). No undo, blobs não são revogados — a coleta de órfãos
  acontece no boot, junto da reconciliação do doc.
- **Deploy**: site estático hospedado na **Vercel**. O cache é definido em `vercel.json` e `public/_headers`
  (conteúdo duplicado — altere os dois juntos): `/assets/*` imutável (1 ano) e `/brand/*` com revalidação de 7 dias,
  pois os assets da marca podem ser regenerados pelo pipeline `npm run assets`.
- **Imutabilidade das pastas raiz**: Nunca modifique diretamente os arquivos nas pastas raiz de assets sem autorização expressa do usuário. Novos assets devem ser processados pelo script `npm run assets`.

# Planejamento de UX — Cuscuz Records Insta Kit

**Data:** 08/11/2026 · **Para:** Reni · **Foco:** o usuário leigo (sem experiência em edição, sem conceitos de design)
**Fontes:** skill `ui-ux-pro-max` (domínio ux), Nielsen Norman Group, WCAG 2.2, Teoria da Carga Cognitiva (Sweller), GOV.UK Service Manual, Canva Newsroom, pesquisa sobre carrosséis do Instagram.

---

## 0. Princípio norteador (o critério de toda decisão)

> *"Isso deixa a leiga com menos dúvida, menos medo e menos chance de errar?"*

Toda proposta abaixo responde "sim" a essa pergunta. Item que não responde, não entra.

---

## 1. O que já está certo — não mexer

- Fluxo por etapas numeradas, com selo "opcional" e botão "Pular" inteligente.
- Regras de design **impostas**: `Texto ≤ Título`, paleta fechada, fontes da marca, presets da logo.
- Reversibilidade em tudo: undo/redo, "Reverter fundo", `aria-live` nos toasts.
- Progresso real (MB + %) no download do modelo de remoção de fundo — raro e excelente.
- Posicionamento assistido: logo em P/M/G + cantos rápidos, enfeites por canto — menos montagem do zero.
- Tom caloroso e consistente ("Bora!", "Prontinho!", "Opa!"), sem jargão.
- Acessibilidade de base já presente: `aria-label` nos ícones, `:focus-visible` verde, `prefers-reduced-motion`.

---

## 2. Momento 0 — "Na tela inicial, escolho post único ou carrossel" *NOVO*

A análise anterior ainda não contava com isso. O novo `ModeSelector` é a capa do produto.

### O que está bom

- Duas cartas visuais grandes (não é uma lista de texto), com ícone + título + descrição de uma linha.
- Escolha de formato do carrossel é uma segunda tela, com botão "Voltar" — **revelação progressiva** do jeito certo (não pede 2 decisões de uma vez).
- Tom ok e `role="dialog"` + `aria-label` presentes.

### Onde o leigo pode travar

1. **"Carrossel: até 10 slides em sequência exportados em ZIP"** — palavra *ZIP* e "10 slides" não contam uma história para quem nunca montou um carrossel. O leigo pensa: *"eu que vou fazer as 10 artes? isso dá um monte de trabalho"*. A descrição diz **o que é**, não **o que ele ganha**.
2. **E se errar a opção?** Ao entrar num modo, o leigo precisa de uma saída visível para voltar à escolha sem medo ("vou ter que recomeçar?"). Hoje existem as funções de conversão (`switchSingleToCarousel`), mas o que importa é o ponto de entrada *dela na tela*.
3. **Formato do carrossel (3:4 / 4:3 / 1:1)** — o leigo não sabe o que cada proporção significa no feed. Sem pista visual, ele clica no que sobrou na memória... e erra por acaso.
4. **Carrossel multiplicou os pontos da arte.** No post único a folha é 1; no carrossel são até 10. O esforço muda de escala: gestão de slides é um conceito novo, sem analogia na interface.

### Oportunidades do Momento 0

| # | Melhoria | Detalhe prático |
|---|---|---|
| **M0.1** | Descrições que vendem o benefício | Post único: *"Uma arte caprichada, do tamanho do feed, pronta pra baixar."* Carrossel: *"Vários cards que contam uma história — perfeito pra lançamento de música ou teasers."* |
| **M0.2** | Miniatura/exemplo dentro das cartas | Um cartãozinho estilizado dentro de cada carta (1 folha vs. 3 folhinhas encadeadas), ao lado do ícone — *reconhecimento em vez de leitura*. |
| **M0.3** | Botão "Trocar de modo" visível no Header | Chip discreto no Header enquanto um modo está ativo. Sempre com confirmação amigável ("Troco pra Carrossel e levo as imagens que você já enviou?") — nada de voltar ao `ModeSelector` por acidente e perder rascunho. |
| **M0.4** | Pista visual do formato | No picker do carrossel e no Header, ao lado do nome de cada formato, um mini retângulo desenhado na proporção correspondente (3:4 alto, 4:3 deitado, 1:1 quadrado) — zero leitura, entendimento imediato. |
| **M0.5** | Selo "Slide 2 de 5" | Não deixar o leigo adivinhar em qual slide ele está. Selo fixo visível perto da folha sempre que `mode === 'carousel'`. (Verificar o que o painel de slides já mostra hoje e completar o que faltar.) |

> Evidência de apoio: estratégia de conteúdo Instagram aponta que **o primeiro slide funciona como gancho (hook), não como capa** — ele precisa abrir um "loop" que o leitor quer fechar (fonte: [socialk.it — Instagram Carousel Strategy](https://socialk.it/en/blog/instagram-carousel-strategy)). Isso vira dica no balão (seção 8).

---

## 3. Momento 1 — "Abri e o app me deixa na folha" (estado vazio)

1. **Estado vazio orientante na folha** — quando `backgroundId === null`, desenhar *dentro da folha*: *"Escolha um fundo no painel à esquerda pra começar 🌽"* com uma seta apontando para o painel. Diretriz da base local (Empty States): mensagem + ação, nunca espaço branco.
   *No carrossel:* aplicar o mesmo no slide ativo.
2. **Primeiro-clique orientado** — no primeiro uso (flag em `localStorage`), chip no topo do painel: *"Toque numa das miniaturas ali embaixo 👆"*, some após a primeira escolha.

---

## 4. Momento 2 — "Começar do zero é duro" (a maior lacuna estrutural)

*Worked example effect* (Sweller; van Gog & Paas, [PDF](https://link.springer.com/content/pdf/10.1007/s10648-010-9145-4.pdf)): novatos aprendem **modificando algo pronto**, não compondo do zero. A Canva construiu um produto inteiro em cima dessa regra ([Canva Newsroom](https://www.canva.com/newsroom/news/empowering-non-designers/)).

3. **3–5 modelos prontos** (por objetivo: lançamento de música, show/teaser, recado da marca): o usuário escolhe e **só troca texto e imagem**. Fundo, hierarquia e posicionamento já vêm resolvidos. No carrossel, um modelo pode ser uma *sequência* pronta (gancho + conteúdo + fechamento) — é aí que a pesquisa de carrossel vira produto.
4. **Botão "Preencher pra mim"** — num post vazio, preenche título + texto de apoio + logo no canto. A pessoa só substitui as palavras.

---

## 5. Momento 3 — "Vou mexer na folha" (a interface invisível)

5. **Etiquetas de texto no dock** — os ícones só têm `title`, que não funciona em toque e demora no hover. Colocar micro-etiqueta permanente junto a cada ícone do dock (Alinhar / Guias / Zoom / Baixar). Resolve a descoberta no celular.
6. **Dica de seleção múltipla** — quando o 1º elemento for selecionado, chip: *"Segure Ctrl e toque em outro item pra selecionar os dois 👆"*. Máx. 2–3 exibições.
7. **Ações sem arrastar** (WCAG 2.5.7 — [fonte](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)): hoje mover tem setas, mas **rotacionar e redimensionar só por alça**. Adicionar slider/botões ± no painel do elemento selecionado. Vale para acessibilidade *e* para o leigo que nunca descobre a alça de rotação.
8. **Alvos de toque no mobile** (WCAG 2.5.8): auditar `IconButton` sm em 375px e aumentar padding onde < 24px.

---

## 6. Momento 4 — "Vou caprichar o conteúdo"

9. **Aviso de contraste inline** — se a cor do texto contrastar < 4.5:1 com o fundo atual ([WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)), exibir abaixo do seletor de cores: *"Essa cor fica difícil de ler sobre esse fundo; prefere a creme 🙈"* + botão de 1 clique para trocar. **Impõe a regra** que o produto promete aplicar sem o usuário saber.
10. **Prévia "tamanho do celular"** — botão 📱 no dock: reduz a folha a ~320px de largura por 3 s. O leigo não sabe que o feed mostra a arte minúscula; sem isso, texto pequeno e detalhe perdido passam despercebidos. Barato e de alto impacto.

---

## 7. Momento 5 — "Algo deu errado / perdi meu post?"

*(renumerado: era o Momento 6 na análise anterior)*

11. **Selo de autosave no Header** ("Salvando… ✓ Salvo"). Não é a função, é a **comunicação** — o autosave já existe em silêncio; o leigo tem medo de perder trabalho e não sabe que está protegido.
12. **Texto de segurança nos erros técnicos** — nos erros de rede do Remover Fundo (e do export), acrescentar: *"Seu post continua salvo aqui na página"*. Leigo confunde qualquer erro técnico com perda de trabalho.

> **Decisão deliberada (registrada):** descartada a proposta de CTA extra de download no painel da etapa 6. O dock é sempre visível e o fluxo **não é linear** — o usuário vai e volta entre ferramentas, e o download acontece quando ele decide. Nada a fazer aqui.

---

## 8. FEATURE NOVA — Balão de dicas de boas práticas 💡

*Substitui qualquer ideia de tutorial frontal.* Evidência: tutoriais frontais são ignorados/esquecidos; **ajuda contextual no momento de uso é o que funciona** ([NN/g — Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/)). O balão é a materialização da responsabilidade nº 2 da seção 1.1 do `AGENTS.md` ("explicar brevemente cada função").

### 8.1 O que é

Ao **ativar uma função**, aparece um balão no canto da tela com uma dica curta de boas práticas de design, com uma barrinha de tempo diminuindo até sumir. Não é um aviso de erro — é educação mínima, no momento exato.

### 8.2 Especificação de comportamento

- **Posição:** canto (mesma zona dos toasts existentes), variante própria de cor ("dica") que **se diferencia** dos toasts de erro (barro) e sucesso (verde). Sem colisão visual: uma dica nunca deve parecer um alerta.
- **Duração:** 6–8 s; a barrinha esmaece proporcionalmente ao tempo restante.
- **Pausa no hover:** com o mouse sobre o balão (ou foco por teclado), o timer congela.
- **Um balão de dica por vez.** Se um toast de erro/sucesso disparar, a dica sai da frente imediatamente e volta ao fim da *fila* — erro tem prioridade absoluta.
- **Disparo:** o ato de **ativar** a função (clicar "Adicionar texto", entrar na etapa Textura, clicar "Remover fundo", ativar espelhamento…), não o mero hover.
- **Anti-repetição:** a mesma dica aparece no máximo **1× por modo/rascunho** (registro em `localStorage`, ex.: `cuscuz-insta-kit:dicas-vistas`). Pode voltar num post *novo* — é aí que a dica tem valor de novo.
- **Controle pelo usuário:** botão X para fechar + atalho *"Não mostrar mais dicas"* dentro do próprio balão (mesma ação do toggle nas configurações — nunca deixar o usuário sem saber onde desligou).
- **Acessibilidade:** `role="status"` + `aria-live="polite"` (anuncia sem interromper), respeita `prefers-reduced-motion` (barra some com fade simples).
- **Conteúdo:** máximo **2 linhas**; sem jargão; tom da marca. Dica que não cabe no limite é reescrita até caber.

### 8.3 Gatilhos e copy v1 (rascunho para validação com usuários)

| Função que dispara | Dica (v1, tom da marca) |
|---|---|
| **Adicionar texto** (etapa Texto) | "Dica de hierarquia: título grande, texto de apoio menor. Menos palavras, mais leitura no feed 😉" |
| **Entrar na etapa Textura / ativar granulado** | "Texturas dão clima, mas em exagero mudam as cores e atrapalham a leitura. 30–40% costuma ficar bonito." |
| **Adicionar imagem** | "Imagens boas são o centro da arte; poucas, bem posicionadas, valem mais que várias disputando atenção." |
| **Remover fundo** (1ª vez) | "O recorte sai melhor com a pessoa centralizada e o fundo bem diferente dela. Vale conferir o modo (Pessoa/Objeto)." |
| **Adicionar logo** | "Logo pequena e de canto fica elegante; gigante disputa atenção com o conteúdo." |
| **Adicionar enfeite** | "Enfeite mora nas bordas e cantos — o centro da folha é do conteúdo." |
| **Espelhar fundo / deslizar em 1:1** | "Deixe a parte mais bonita do fundo nas áreas onde vai ficar o texto." |
| **Entrar no Carrossel / 1º slide** | "O primeiro card é o gancho: abra uma curiosidade que o próximo slide responde 🎠" |
| **Efeito da Marca** (1ª vez) | "Esse acabamento já aplica o traçado creme + sombra oficial da Cuscuz. Sem medo — desligar desfaz." |

> Essas copies são **ponto de partida**: após a Fase 2 rodar, validar com as 5 pessoas de teste (seção 10) e refinar.

### 8.4 Modal de configurações ⚙️

- **Onde:** engrenagem no Header (ao lado do undo), `aria-label="Configurações"`.
- **v1 (minimalista de propósito):** uma única opção — *"Dicas de boas práticas"* com toggle, **ligado por padrão** (a dica é a promessa do produto; desligar é decisão consciente do usuário).
- **Estrutura preparada:** componente `SettingsModal` com grid de linhas (rótulo + descrição curta + controle), pronto para receber futuras opções sem reworks.
- **Estado:** `localStorage` (`cuscuz-insta-kit:config`), schema versionado (objeto com campo de versão) para expansão sem migração dolorosa.
- **Acesso a partir do balão:** o atalho "Não mostrar mais dicas" desliga o toggle **e abre o modal** — deixa visível *onde* desligou, para ser fácil re-ligar depois.

### 8.5 Onde mora (orientação para implementação — é plano, não código)

- Reusar a infraestrutura do `Toast` (`components/Toast.tsx`) + `showToast` do `editorStore` como fundamento; novo componente `TipToast` (fila própria, barinha de tempo).
- Módulo de conteúdo `lib/tips.ts`: lista declarativa de dicas (id, gatilho, texto) + registro de "vistas".
- `components/SettingsModal.tsx` no Header.
- Esforço: **médio** (um componente + um módulo + integração nos gatilhos). Impacto: **alto** — é o recurso que entrega de vez "explicar cada função" e diferencia o produto de um editor qualquer.

---

## 9. Priorização e fases

| Fase | Item | Impacto | Esforço |
|---|---|---|---|
| **1 — passos rápidos** | 1. Estado vazio orientante na folha | Alto | Baixo |
| | 11. Selo "Salvando… ✓ Salvo" | Alto | Baixo |
| | 10. Prévia "tamanho do celular" | Alto | Baixo |
| | 12. Texto de segurança em erros | Médio | Baixo |
| | 6. Dica de seleção múltipla | Médio | Baixo |
| **2 — educação no contexto** | **8. Balão de dicas + modal de Configurações** | **Alto** | Médio |
| | 9. Aviso de contraste inline | Alto | Médio |
| | 5. Etiquetas de texto no dock | Alto | Médio |
| | 7. Rotação/redimensionar sem arrastar | Alto | Médio |
| | M0.4. Pista visual do formato | Médio | Baixo |
| **3 — estrutural** | **M0.1–M0.3. Modos + Trocar de modo** | Alto | Médio |
| | M0.5. "Slide X de Y" no carrossel | Médio | Médio |
| | **3. Templates (worked examples)** | **Muito alto** | Alto |
| | 4. "Preencher pra mim" | Alto | Médio |

Regra de leitura: **Fase 1** = cosmética de confiança (baixo custo, alto retorno). **Fase 2** = o sistema de dicas é o coração desta versão. **Fase 3** = reduz a carga cognitiva inicial de ~6 decisões para 1 (escolher modelo) — a mudança mais profunda.

---

## 10. Como validar (GOV.UK — [manual oficial](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing))

1. **Recrutar 5 pessoas do perfil real** (nunca mexeram em editor; fazem arte no Canva de última hora).
2. **1 tarefa por sessão:** *"Crie um post falando do próximo show e baixe."* (No segundo round: *"Monte um carrossel de teaser de lançamento."*)
3. **Think-aloud** — a pessoa narra o que está pensando; não perguntar "gostou", **observar**.
4. **Registrar só 3 coisas:** (a) onde hesita >5 s; (b) onde diz "não sei onde isso fica"; (c) onde desiste.
5. **Rodar 2×:** antes da Fase 2 (refina as copies das dicas v1) e depois da Fase 3 (compara com a linha de base).

---

## 11. Fora de escopo — decisões deliberadas

- **Nada de tour obrigatório no primeiro uso** — evidência NN/g: é ignorado/esquecido; o balão de dicas (seção 8) substitui com ajuda no momento real.
- **Nada de CTA extra de download no painel da etapa 6** — fluxo não é linear; o dock já resolve (Reni, 08/11/2026).
- **Nenhuma remoção de fundo automática** — permanece botão explícito (regra 2.10 do `AGENTS.md`).

---

## 12. Checklist de execução (para os agentes que implementarem)

- [ ] Fase 1: os 5 itens rápidos (seções 3, 6, 7) — *nenhum* quebra as regras da marca.
- [ ] Fase 2: TipToast + fila + localStorage de vistas + SettingsModal com toggle.
- [ ] Fase 2: refinar **todas** as copies de dica depois do teste com usuários.
- [ ] Fase 3: templates + modo (M0) — alinhar com o Reni antes de criar templates visuais (são assets oficiais da marca).
- [ ] Cada item: testar em 375px (alvos de toque) + leitor de tela básico + `prefers-reduced-motion`.
- [ ] localStorage guarda apenas preferências de UI — nunca dados da arte.

**FIM DO PLANO**

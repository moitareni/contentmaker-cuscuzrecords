# Documento de Requisitos: Carrossel de Posts para Instagram

## Introdução

Esta feature adiciona ao **Cuscuz Records Insta Kit** o modo **Carrossel**, que permite criar e exportar séries de até 10 slides para o feed do Instagram. Cada slide é um `Doc` + `FinishState` completamente independente, editado pelo mesmo editor de 6 etapas já existente. O carrossel é exportado como arquivo ZIP contendo os slides numerados em PNG, mantendo 100% das regras visuais da Cuscuz Records em cada slide individualmente.

O modo **Post único** existente não sofre nenhuma alteração.

---

## Glossário

- **App**: a aplicação web Cuscuz Records Insta Kit.
- **Modo Post Único**: o modo de edição atual que produz um único PNG.
- **Modo Carrossel**: o novo modo de edição que gerencia múltiplos slides.
- **Tela Inicial**: a tela de boas-vindas exibida antes de entrar em qualquer modo de edição.
- **Slide**: uma unidade de conteúdo do carrossel, composta por um `Doc` e um `FinishState` independentes.
- **SlideData**: estrutura de dados que representa um slide: `{ id, doc, finish }`.
- **Slide Ativo**: o slide atualmente exibido no canvas de edição.
- **Tira de Miniaturas**: componente horizontal ou lateral com previews clicáveis de todos os slides do carrossel.
- **Miniatura**: representação em baixa resolução do slide gerada a partir do Stage do Konva.
- **Gerenciador de Carrossel**: o store Zustand dedicado ao estado do carrossel (`cuscuz-insta-kit:carrossel`).
- **Editor de Slide**: o editor de 6 etapas (canvas + painéis) já existente, que opera sobre o Slide Ativo.
- **CAROUSEL_MAX_SLIDES**: constante com valor `10`, limite máximo de slides por carrossel.
- **JSZip**: biblioteca JavaScript usada para geração do arquivo ZIP de exportação.
- **ZIP de Exportação**: arquivo `cuscuz-carrossel-YYYY-MM-DD-HHmm.zip` com os slides numerados `slide-01.png`, `slide-02.png`, etc.
- **Rascunho de Carrossel**: os dados do carrossel (slides e índice ativo) persistidos no `localStorage` sob a chave `cuscuz-insta-kit:carrossel`.
- **Doc**: estrutura de dados do documento de um post com campos `format`, `backgroundId`, `backgroundFlipX`, `backgroundFlipY`, `backgroundOffsetY` e `elements[]`.
- **FinishState**: estrutura de acabamento do post com os campos `paper`, `grain` e `borderTexture`.
- **PostFormat**: um dos três formatos suportados: `'3:4'`, `'4:3'` ou `'1:1'`.
- **IndexedDB**: banco de dados do navegador onde os blobs de imagens do usuário são armazenados.
- **GC de Imagens**: processo de coleta de blobs órfãos no IndexedDB, executado no boot.
- **Toast**: notificação temporária exibida na interface ao usuário.
- **PixelRatio de Miniatura**: razão de escala usada ao capturar o Stage do Konva para gerar a miniatura em baixa resolução.
- **Diálogo de Troca de Modo**: caixa de seleção exibida ao trocar do Modo Carrossel para o Modo Post Único, que lista os slides disponíveis com miniaturas e permite escolher qual manter ou começar do zero.
- **Zona de Sangria**: faixa visual de ~80px nas bordas laterais da folha (direita quando há slide seguinte; esquerda quando há slide anterior), exibida quando um elemento é arrastado próximo a ela, indicando que o elemento pode atravessar para o slide vizinho.
- **Elemento Crossover**: elemento posicionado entre dois slides adjacentes (marcado com `crossover: true` ou que ultrapassa a borda lateral `x < 0` ou `x > postWidth`) que aparece em ambos os slides com 100% de opacidade e pode ser selecionado, movido, redimensionado, rotacionado, espelhado, editado ou excluído a partir de **qualquer uma das páginas** que compartilha o elemento.
- **Continuação Visual Sincronizada**: representação ativa e interativa de um Elemento Crossover sincronizada entre os `doc.elements` dos slides adjacentes (com o mesmo `id` e coordenada horizontal trasladada em `-postWidth` no slide seguinte e `+postWidth` no slide anterior, mantendo `opacity: 1` e demais propriedades idênticas). Garante manipulação bidirecional em ambas as páginas e preservação do elemento caso qualquer uma das páginas seja escolhida ao converter de Carrossel para Post Único.

---

## Requisitos

---

### Requisito 1 — Seleção de Modo na Tela Inicial

**User Story:** Como usuária da Cuscuz Records, quero escolher entre criar um Post Único ou um Carrossel na tela inicial, para que eu entre diretamente no modo correto sem precisar navegar por menus.

#### Critérios de Aceitação

1. THE App SHALL exibir a Tela Inicial com duas opções visíveis: "Post único" e "Carrossel", antes de entrar em qualquer modo de edição.

2. WHEN a usuária seleciona "Post único" na Tela Inicial, THE App SHALL abrir o Editor de Slide no Modo Post Único, sem exibir a Tira de Miniaturas.

3. WHEN a usuária seleciona "Carrossel" na Tela Inicial, THE App SHALL abrir o Modo Carrossel com um slide inicial vazio e exibir a Tira de Miniaturas.

4. WHEN a usuária está no Modo Post Único e solicita trocar para o Modo Carrossel, THE App SHALL converter automaticamente o `Doc` e o `FinishState` atuais no primeiro slide do carrossel, sem exibir confirmação, e abrir o Modo Carrossel com esse slide como Slide Ativo.

5. WHEN a usuária está no Modo Post Único, o `Doc` atual estiver vazio (sem fundo selecionado e sem elementos) e a usuária solicitar trocar para o Modo Carrossel, THE App SHALL abrir o Modo Carrossel com um primeiro slide vazio, sem exibir confirmação.

6. WHEN a usuária está no Modo Carrossel e solicita trocar para o Modo Post Único, THE App SHALL exibir um diálogo de seleção de slide perguntando qual slide a usuária deseja manter como post único, listando todos os slides disponíveis com suas miniaturas e a opção "Começar do zero".

7. WHEN a usuária seleciona um slide no diálogo de troca para Modo Post Único, THE App SHALL carregar o `Doc` e o `FinishState` desse slide no editor do Modo Post Único — preservando todos os elementos visíveis naquele slide, inclusive quaisquer Elementos Crossover que tenham sido importados originalmente pelo slide vizinho e atravessem para o slide escolhido (com `crossover` limpo) —, descartar o rascunho do carrossel e abrir o Modo Post Único.

8. WHEN a usuária seleciona "Começar do zero" no diálogo de troca para Modo Post Único, THE App SHALL descartar o rascunho do carrossel, resetar o editor para doc e finish padrão e abrir o Modo Post Único com conteúdo vazio.

9. WHEN a usuária cancela o diálogo de troca para Modo Post Único, THE App SHALL manter o Modo Carrossel sem alterações.

10. WHEN a usuária abre o App com um Rascunho de Carrossel salvo, THE App SHALL oferecer a opção de retomar o rascunho diretamente, sem passar pela Tela Inicial novamente.

11. WHEN a usuária abre o App com um rascunho de Post Único salvo, THE App SHALL restaurar o Modo Post Único diretamente, sem passar pela Tela Inicial.

---

### Requisito 2 — Formato do Carrossel

**User Story:** Como usuária da Cuscuz Records, quero definir o formato do carrossel (vertical, horizontal ou quadrado) ao criá-lo, para que todos os slides tenham proporções consistentes.

#### Critérios de Aceitação

1. WHEN a usuária inicia um novo carrossel, THE App SHALL exibir a seleção de PostFormat (`3:4`, `4:3` ou `1:1`) antes de criar o primeiro slide.

2. THE Gerenciador de Carrossel SHALL aplicar o PostFormat selecionado a todos os slides do carrossel.

3. WHILE o Modo Carrossel está ativo, THE App SHALL exibir o PostFormat vigente como informação somente leitura e não permitir alteração do formato.

4. IF a usuária tenta alterar o PostFormat enquanto o Modo Carrossel está ativo, THEN THE App SHALL exibir um Toast informando que o formato não pode ser alterado após a criação do carrossel.

---

### Requisito 3 — Gerenciamento de Slides

**User Story:** Como usuária da Cuscuz Records, quero adicionar, remover, duplicar e reordenar slides no carrossel, para que eu possa construir a sequência de posts de forma flexível.

#### Critérios de Aceitação

1. THE Gerenciador de Carrossel SHALL manter a lista de slides como um array de `SlideData` (`{ id, doc, finish }`), em que cada slide é completamente independente dos demais.

2. WHEN a usuária aciona "Novo slide vazio", THE Gerenciador de Carrossel SHALL adicionar um `SlideData` com `Doc` vazio e `FinishState` padrão ao final da lista e torná-lo o Slide Ativo.

3. WHEN a usuária aciona "Duplicar slide atual", THE Gerenciador de Carrossel SHALL criar uma cópia profunda do `Doc` e do `FinishState` do Slide Ativo, inserir a cópia imediatamente após o Slide Ativo na lista e torná-la o Slide Ativo.

4. WHILE o carrossel tem menos de `CAROUSEL_MAX_SLIDES` slides, THE App SHALL manter os botões de adicionar e duplicar slide habilitados.

5. WHEN a contagem de slides atinge `CAROUSEL_MAX_SLIDES`, THE App SHALL desabilitar os botões de adicionar e duplicar slide e exibir um Toast informando o limite de 10 slides.

6. WHEN a usuária aciona "Remover slide" em um slide sem conteúdo (`Doc` vazio e `FinishState` padrão), THE Gerenciador de Carrossel SHALL remover o slide sem exibir confirmação.

7. WHEN a usuária aciona "Remover slide" em um slide com conteúdo, THE App SHALL exibir uma caixa de confirmação antes de remover o slide.

8. WHEN a usuária confirma a remoção de um slide, THE Gerenciador de Carrossel SHALL remover o slide da lista e definir o slide anterior como Slide Ativo (ou o slide seguinte, se o removido era o primeiro).

9. IF o carrossel tiver apenas 1 slide e a usuária acionar "Remover slide", THEN THE App SHALL exibir um Toast informando que o carrossel precisa ter pelo menos 1 slide, sem remover.

10. WHEN a usuária arrasta uma miniatura na Tira de Miniaturas para uma nova posição, THE Gerenciador de Carrossel SHALL reordenar a lista de slides conforme o drop, mantendo o mesmo slide como Slide Ativo (atualizando seu índice).

11. THE App SHALL exibir um botão "+" posicionado imediatamente após a última miniatura na Tira de Miniaturas, que ao ser acionado adiciona um novo slide vazio ao final do carrossel e o torna o Slide Ativo, com o mesmo comportamento do botão "Novo slide vazio" da barra de controles.

12. THE App SHALL exibir um ícone de lixeira sobreposto no canto superior direito de cada `SlideThumb` na Tira de Miniaturas; ao acionar a lixeira de um slide com conteúdo, THE App SHALL exibir o `ConfirmDialog` de remoção; ao acionar a lixeira de um slide vazio, THE App SHALL remover o slide diretamente, sem confirmação.

---

### Requisito 4 — Navegação entre Slides

**User Story:** Como usuária da Cuscuz Records, quero navegar entre os slides clicando nas miniaturas ou usando botões de anterior/próximo, para que eu possa alternar rapidamente entre os slides do carrossel.

#### Critérios de Aceitação

1. THE App SHALL exibir a Tira de Miniaturas com todas as miniaturas de slides enquanto o Modo Carrossel está ativo.

2. WHEN a usuária clica em uma miniatura na Tira de Miniaturas, THE App SHALL definir o slide correspondente como Slide Ativo e carregar seu `Doc` e `FinishState` no Editor de Slide.

3. WHEN a usuária clica no botão "Próximo slide", THE App SHALL definir o slide seguinte como Slide Ativo, desde que exista um slide seguinte.

4. WHEN a usuária clica no botão "Slide anterior", THE App SHALL definir o slide anterior como Slide Ativo, desde que exista um slide anterior.

5. IF não houver slide seguinte, THEN THE App SHALL manter o botão "Próximo slide" desabilitado.

6. IF não houver slide anterior, THEN THE App SHALL manter o botão "Slide anterior" desabilitado.

7. THE App SHALL aplicar um destaque visual (borda ou indicador) à miniatura do Slide Ativo na Tira de Miniaturas.

8. WHEN a usuária troca o Slide Ativo, THE App SHALL resetar a etapa do Editor de Slide para a etapa 0 (Fundo) e limpar a seleção de elementos.

---

### Requisito 5 — Miniaturas dos Slides

**User Story:** Como usuária da Cuscuz Records, quero ver miniaturas visuais de cada slide na Tira de Miniaturas, para que eu possa identificar rapidamente o conteúdo de cada slide antes de clicar.

#### Critérios de Aceitação

1. THE App SHALL exibir em cada miniatura da Tira de Miniaturas um badge com o número ordinal do slide (1, 2, 3...).

2. WHEN o conteúdo do Slide Ativo é modificado, THE App SHALL regenerar a miniatura do Slide Ativo em no máximo 500ms após a última modificação.

3. THE App SHALL gerar as miniaturas utilizando o Stage do Konva com PixelRatio de Miniatura reduzido, de modo que a largura renderizada seja de aproximadamente 270px para o formato 3:4.

4. IF a miniatura de um slide ainda não foi gerada, THEN THE App SHALL exibir um placeholder com a cor de fundo do slide ou um indicador de carregamento.

5. THE App SHALL exibir as miniaturas na mesma proporção (aspect ratio) do PostFormat do carrossel.

---

### Requisito 6 — Edição por Slide (Isolamento do Editor)

**User Story:** Como usuária da Cuscuz Records, quero que cada slide seja editado de forma completamente independente, para que as alterações em um slide não afetem os demais.

#### Critérios de Aceitação

1. WHILE o Modo Carrossel está ativo, THE Editor de Slide SHALL operar exclusivamente sobre o `Doc` e o `FinishState` do Slide Ativo.

2. WHEN a usuária modifica qualquer elemento do Slide Ativo, THE Gerenciador de Carrossel SHALL persistir a alteração somente no `SlideData` do Slide Ativo.

3. THE Editor de Slide SHALL aplicar todas as regras existentes de forma independente por slide: limite de 5 imagens por slide (conforme `IMAGE_MAX_COUNT`), regra `Texto ≤ Título`, limites de fonte (`FONT_SIZE_MIN`, `FONT_SIZE_MAX`) e restrições de logo única por slide.

4. WHILE o Modo Carrossel está ativo, THE App SHALL manter o histórico de undo/redo (zundo) vinculado ao Slide Ativo, com limite de 50 entradas por slide.

5. WHEN a usuária troca o Slide Ativo, THE App SHALL congelar o histórico de undo/redo do slide que está sendo deixado e carregar o histórico do novo Slide Ativo.

6. WHEN a usuária executa Ctrl+Z ou Ctrl+Y enquanto o Modo Carrossel está ativo, THE App SHALL aplicar undo/redo somente no histórico do Slide Ativo.

7. THE Editor de Slide SHALL permitir a remoção de fundo de imagens (conforme regras da seção 2.10 do AGENTS.md) de forma independente por slide.

---

### Requisito 7 — Exportação do Carrossel

**User Story:** Como usuária da Cuscuz Records, quero exportar todos os slides do carrossel de uma só vez em um arquivo ZIP, para que eu possa fazer o upload no Instagram sem precisar exportar slide por slide.

#### Critérios de Aceitação

1. THE App SHALL exibir o botão "Exportar carrossel" no Header quando o Modo Carrossel estiver ativo.

2. WHEN a usuária aciona "Exportar carrossel", THE App SHALL renderizar cada slide sequencialmente no Stage do Konva, capturar o PNG em resolução completa e adicionar ao ZIP via JSZip.

3. THE App SHALL nomear cada arquivo dentro do ZIP como `slide-01.png`, `slide-02.png`, até `slide-NN.png`, onde `NN` é o número ordinal com zero à esquerda.

4. THE App SHALL nomear o arquivo ZIP como `cuscuz-carrossel-YYYY-MM-DD-HHmm.zip`, onde `YYYY-MM-DD-HHmm` representa a data e hora local da exportação.

5. THE App SHALL exibir uma barra de progresso durante a exportação com a mensagem "Exportando slide N de M..." para cada slide processado.

6. WHILE a exportação está em andamento, THE App SHALL desabilitar o botão "Exportar carrossel" para evitar exportações concorrentes.

7. WHEN a exportação for concluída com sucesso, THE App SHALL iniciar a animação de confete comemorativo e oferecer o download do arquivo ZIP.

8. IF ocorrer um erro durante a exportação de qualquer slide, THEN THE App SHALL exibir um Toast de erro com o número do slide que falhou e cancelar a exportação.

9. THE App SHALL exportar cada slide nas dimensões completas do PostFormat definido para o carrossel (1080×1440 para 3:4, 1440×1080 para 4:3, 1080×1080 para 1:1).

10. WHERE o formato do carrossel é `1:1`, THE App SHALL aplicar o corte vertical (recorte do excesso de 360px de altura) em cada slide exportado, conforme as regras do formato quadrado.

---

### Requisito 8 — Persistência do Carrossel

**User Story:** Como usuária da Cuscuz Records, quero que o rascunho do carrossel seja salvo automaticamente, para que eu não perca meu trabalho ao fechar ou recarregar o navegador.

#### Critérios de Aceitação

1. THE Gerenciador de Carrossel SHALL persistir o Rascunho de Carrossel no `localStorage` sob a chave `cuscuz-insta-kit:carrossel`, com a estrutura `{ slides: SlideData[], activeSlideIndex: number, format: PostFormat }`.

2. THE Gerenciador de Carrossel SHALL persistir somente os metadados de imagens (`imageId`, `name`, `width`, `height`) em cada `SlideData` no `localStorage`, nunca blobs ou base64.

3. THE Gerenciador de Carrossel SHALL salvar o Rascunho de Carrossel com debounce de 300ms após cada modificação e garantir a gravação imediata ao fechar a aba (evento `beforeunload`).

4. WHEN o App é iniciado e existe um Rascunho de Carrossel válido na chave `cuscuz-insta-kit:carrossel`, THE App SHALL restaurar o carrossel com todos os slides e o índice ativo salvo.

5. WHEN o App é iniciado em Modo Carrossel, THE App SHALL executar a reconciliação de imagens considerando os `imageId`s de todos os slides (não apenas do Slide Ativo) contra o IndexedDB.

6. WHEN a reconciliação identifica um `imageId` ausente no IndexedDB em qualquer slide, THE Gerenciador de Carrossel SHALL remover os elementos de imagem correspondentes daquele slide.

7. WHEN o App é iniciado em Modo Carrossel, THE App SHALL executar o GC de imagens do IndexedDB considerando os `imageId`s e `cutFrom.imageId`s de todos os slides do carrossel para identificar blobs órfãos.

8. THE Gerenciador de Carrossel SHALL validar e sanitizar cada `SlideData` restaurado do `localStorage` (formato válido, `backgroundId` existente no manifest, `elements` com metadados completos), usando valores padrão para campos inválidos ou ausentes.

---

### Requisito 9 — Integridade e Não-Regressão

**User Story:** Como desenvolvedora, quero que a feature de carrossel seja adicionada sem comprometer o Modo Post Único existente, para que as usuárias que só usam posts simples não sejam afetadas.

#### Critérios de Aceitação

1. THE App SHALL manter o Modo Post Único completamente funcional e inalterado quando a usuária entra por essa opção na Tela Inicial.

2. THE App SHALL manter a chave de persistência `cuscuz-insta-kit:rascunho` exclusiva do Modo Post Único, sem que o Modo Carrossel leia ou escreva nessa chave.

3. THE App SHALL introduzir somente a biblioteca JSZip como nova dependência de produção para a feature de carrossel.

4. THE App SHALL manter o bundle do Modo Post Único sem aumento de tamanho causado pelo código do Modo Carrossel, utilizando code splitting (lazy loading) para os módulos exclusivos do carrossel.

5. WHEN a usuária está no Modo Post Único, THE App SHALL não exibir a Tira de Miniaturas nem os controles de gerenciamento de slides.

6. THE App SHALL aplicar todas as regras visuais da Cuscuz Records (paleta, tipografia, efeitos de texto, bordas, enfeites) de forma idêntica em cada slide do carrossel e no Modo Post Único.

---

### Requisito 10 — Desempenho das Miniaturas

**User Story:** Como usuária da Cuscuz Records, quero que as miniaturas dos slides sejam geradas rapidamente, para que a navegação entre slides seja fluida mesmo com 10 slides no carrossel.

#### Critérios de Aceitação

1. THE App SHALL gerar cada miniatura de slide em no máximo 500ms a partir do momento em que o slide se torna ativo ou é modificado.

2. THE App SHALL cachear a miniatura de cada slide e reutilizar o cache enquanto o `Doc` e o `FinishState` do slide não forem modificados.

3. WHEN a usuária está editando o Slide Ativo de forma contínua (ex.: arrastando um slider), THE App SHALL atualizar a miniatura com debounce de no mínimo 400ms para não bloquear o canvas principal.

4. THE App SHALL gerar as miniaturas de slides não-ativos de forma lazy (sob demanda, ao se tornarem visíveis na Tira de Miniaturas), sem bloquear a renderização inicial do Editor de Slide.

---

### Requisito 11 — Elemento de Ligação entre Slides (Crossover Visual Bidirecional e Manipulável em Ambas as Páginas)

**User Story:** Como usuária da Cuscuz Records, quero posicionar um elemento entre duas páginas adjacentes do carrossel de forma que sua continuação apareça com opacidade total na página vizinha, podendo manipular o elemento por qualquer uma das páginas e sem perdê-lo caso qualquer uma delas seja escolhida ao trocar para Post Único.

#### Critérios de Aceitação

1. WHILE o Modo Carrossel está ativo e um elemento é arrastado próximo à borda direita do Slide Ativo (existindo um slide seguinte) ou próximo à borda esquerda do Slide Ativo (existindo um slide anterior), THE App SHALL exibir a Zona de Sangria correspondente — uma faixa visual semi-transparente nos 80px daquela borda — indicando que o elemento continuará no slide adjacente.

2. WHEN o usuário solta um elemento dentro da Zona de Sangria (direita ou esquerda) ou atravessando a borda lateral, THE App SHALL marcar o elemento com `crossover: true` e sincronizá-lo com o slide adjacente correspondente.

3. WHEN um slide `i` possui um Elemento Crossover na borda direita (ou que ultrapassa `x > postWidth`), THE App SHALL sincronizar esse elemento no `doc.elements` do slide seguinte (`i + 1`) posicionado na borda esquerda (`x = element.x - postWidth`), com exatamente os mesmos atributos visuais (cor, textura, modo de mesclagem, rotação, tamanho, espelhamento e **opacidade 100%**).

4. WHEN um slide `i` possui um Elemento Crossover na borda esquerda (ou que ultrapassa `x < 0`), THE App SHALL sincronizar esse elemento no `doc.elements` do slide anterior (`i - 1`) posicionado na borda direita (`x = element.x + postWidth`), com exatamente os mesmos atributos visuais (cor, textura, modo de mesclagem, rotação, tamanho, espelhamento e **opacidade 100%**).

5. THE App SHALL permitir selecionar, mover, redimensionar, rotacionar, espelhar, editar propriedades e excluir um Elemento Crossover a partir de **qualquer uma das páginas** que ele atravessa, propagando automaticamente as alterações para a página adjacente (com o deslocamento horizontal `±postWidth` correspondente).

6. WHEN o usuário arrasta um Elemento Crossover para longe da borda compartilhada em qualquer uma das páginas (de modo que ele deixe de sangrar para a página vizinha), THE App SHALL remover o elemento da página vizinha, mantê-lo apenas na página onde foi posicionado e limpar `crossover`. WHEN o usuário exclui o Elemento Crossover em qualquer uma das páginas, THE App SHALL removê-lo de ambas as páginas.

7. THE App SHALL suportar Elementos Crossover em todos os tipos de elemento: `DecorationEl`, `TextEl`, `LogoEl` e `ImageEl`.

8. IF o Slide Ativo for o último slide do carrossel, THEN THE App SHALL não exibir a Zona de Sangria na borda direita; IF o Slide Ativo for o primeiro slide do carrossel, THEN THE App SHALL não exibir a Zona de Sangria na borda esquerda.

9. WHEN a usuária converte do Modo Carrossel para o Modo Post Único e escolhe qualquer uma das páginas que compartilha um Elemento Crossover (mesmo a página que não importou originalmente o elemento), THE App SHALL preservar o elemento no `Doc` da página escolhida em sua coordenada local (`x`), sem que ele desapareça.

10. THE App SHALL renderizar os Elementos Crossover com fidelidade idêntica no preview, nas miniaturas e nos PNGs exportados do carrossel, persistindo-os na estrutura padrão dos slides.

11. WHEN o usuário executa Ctrl+Z ou Ctrl+Y em qualquer um dos slides que compartilha o Elemento Crossover, THE App SHALL sincronizar imediatamente a alteração desfeita/refeita com o slide adjacente.

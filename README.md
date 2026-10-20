# Cuscuz Records Insta Kit

Gerador de posts 3:4 (1080×1440) para o feed do Instagram com a identidade visual
da Cuscuz Records. App 100% estático (React + Vite + Konva), sem back-end — veja o
manual completo em `../AGENTS.md`.

## Comandos

```powershell
npm run assets      # pipeline de otimização dos assets da marca
npm run dev         # desenvolvimento local
npm run test        # testes unitários (Vitest)
npm run typecheck   # checagem estrita de tipos
npm run build       # build de produção
npm run e2e         # testes end-to-end (Playwright)
npm run preview     # prévia do build (porta 4173)
```

## Remoção de fundo (etapa 3)

O recorte roda inteiro no navegador da usuária, sem servidor: as fotos nunca saem
da máquina. Na primeira utilização a ferramenta de recorte (~100MB) é baixada uma
única vez e fica em cache — depois funciona até offline.

Créditos e licenças da peça de IA:

- **[BiRefNet](https://github.com/ZhengPeng7/BiRefNet)** — *Bilateral Reference for
  High-Resolution Dichotomous Image Segmentation* (CAAI AIR 2024), de Zheng Peng,
  Dehong Gao, Deng-Ping Fan, Li Liu, Jorma Laaksonen, Wanli Ouyang e Nicu Sebe.
  Código e pesos sob **licença MIT** (© 2024 Zheng Peng).
- **[studioludens/birefnet-lite-512](https://huggingface.co/studioludens/birefnet-lite-512)** —
  re-export ONNX 512×512 do `BiRefNet_lite` pronto para navegador (© 2026 Studio
  Ludens V.O.F., MIT), servido pelo Hugging Face e executado via
  [transformers.js](https://huggingface.co/docs/transformers.js).
- A decontamination das bordas segue o `refine_foreground` oficial do BiRefNet
  (FB blur fusion, técnica do [fast-foreground-estimation](https://github.com/Photoroom/fast-foreground-estimation)
  da Photoroom).

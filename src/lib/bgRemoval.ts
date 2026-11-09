/**
 * Remoção de fundo 100% no navegador com BiRefNet_lite 512 (ONNX fp16).
 *
 * Modelo: `studioludens/birefnet-lite-512` — re-export browser-ready do
 * BiRefNet_lite de Zheng Peng (MIT), servido via Hugging Face e cacheado no
 * navegador pelo transformers.js (baixa uma única vez, funciona offline depois).
 *
 * Duas calibragens sobre o mesmo modelo:
 * - `person`: mantém o alpha parcial (cabelo/fios) e aplica a decontamination
 *   de cor das bordas (FB blur fusion, mesma técnica do `refine_foreground`
 *   oficial do BiRefNet), evitando fringe do recote sobre os fundos da marca.
 * - `object`: máscara firme — median + curva estreita + erosão + feather curto.
 *
 * O pós-processo do alpha roda na resolução nativa do matte (512²), onde os
 * parâmetros fazem sentido, e o resultado sobe para a imagem final via
 * bilinear (o matte nunca teve mais detalhe que isso).
 *
 * As funções puras de processamento de imagem (DSP) vivem em `bgRemovalDsp.ts`;
 * este arquivo fica só com a orquestração: modelo, inferência e pipeline.
 */

import { IMAGE_WEBP_QUALITY, downscaleDimensions } from './imageRules';
import { canvasToBlob } from './userImages';
import { setBgModelError, setBgModelReady, setBgModelStatus, type BgRemovalMode } from './bgRemovalStatus';
import {
  applyCutoutData,
  downsamplePlane,
  erode3x3,
  fbFusionForeground,
  fromHalfFloat,
  gammaCurve,
  gaussianBlur,
  median3x3,
  sigmoidInPlace,
  smoothstepCurve,
} from './bgRemovalDsp';

export type { BgRemovalMode };
// -------------------------------------------------------------- constantes

/** Repositório do modelo browser-ready (transformers.js, dtype fp16 por padrão). */
export const BG_MODEL_ID = 'studioludens/birefnet-lite-512';
/** Resolução de entrada/saída do modelo (matte 512×512). */
export const MODEL_INPUT = 512;
/** Normalização ImageNet usada no treino do BiRefNet. */
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;
/** Lado máximo do plano de trabalho da decontamination de cor. */
const DECONTAM_MAX_SIDE = 1280;

/** Tamanho aproximado do primeiro download (modelo + runtime), p/ cópia da UI. */
export function bgModelSizeHint(): string {
  return bgUsesWebGPU() ? '~100MB' : '~180MB';
}

export interface BgRemovalPreset {
  /** Curva smoothstep aplicada ao matte (alpha parcial sobrevive entre os dois). */
  smoothEdge0: number;
  smoothEdge1: number;
  /** Gamma do alpha: <1 puxa p/ frente (salva fios), >1 endurece. */
  gamma: number;
  /** Median 3×3 antes da curva: limpa furinhos/ruído. */
  median: boolean;
  /** Erosão 1px depois da curva: mata halo de fundo claro. */
  erode: boolean;
  /** Feather gaussiano do alpha final, em px do matte. */
  featherSigma: number;
  /** Decontamination de cor nas bordas (FB blur fusion). */
  decontaminate: boolean;
}

export const BG_REMOVAL_PRESETS: Record<BgRemovalMode, BgRemovalPreset> = {
  person: {
    smoothEdge0: 0.25,
    smoothEdge1: 0.75,
    gamma: 0.85,
    median: false,
    erode: false,
    featherSigma: 1.2,
    decontaminate: true,
  },
  object: {
    smoothEdge0: 0.5,
    smoothEdge1: 0.68,
    gamma: 1.1,
    median: true,
    erode: true,
    featherSigma: 0.5,
    decontaminate: false,
  },
};

export interface BgRemovalResult {
  blob: Blob;
  width: number;
  height: number;
}

// ------------------------------------------------------- modelo (transformers.js)

type TfModule = typeof import('@huggingface/transformers');
type TfTensor = import('@huggingface/transformers').Tensor;
type TfTensorCtor = new (type: 'float32', data: Float32Array, dims: number[]) => TfTensor;

/** Instância do modelo é callable (classe `Callable` do transformers.js). */
type ModelInvoke = (inputs: { input_image: TfTensor }) => Promise<Record<string, unknown>>;

function isTensorCtor(value: unknown): value is TfTensorCtor {
  return typeof value === 'function';
}

/** Instância do modelo é callable (classe `Callable` do transformers.js). */
function isModelInvoke(value: unknown): value is ModelInvoke {
  return typeof value === 'function';
}

function isTensorLike(value: unknown): value is TfTensor {
  return !!tensorCtor && value instanceof tensorCtor;
}

/** Guard p/ data de Tensor: qualquer indexável numérico (Float32, Uint16…). */
function isNumberIndexable(value: unknown): value is { length: number; [index: number]: number } {
  if (typeof value !== 'object' || value === null) return false;
  if (typeof Reflect.get(value, 'length') !== 'number') return false;
  return typeof Reflect.get(value, 0) === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

let tfPromise: Promise<TfModule> | null = null;
let tensorCtor: TfTensorCtor | null = null;
let bgModel: unknown = null;
let modelPromise: Promise<void> | null = null;

/** WebGPU disponível no navegador? Define o caminho rápido vs. wasm. */
export function bgUsesWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function loadTransformers(): Promise<TfModule> {
  if (!tfPromise) {
    tfPromise = import('@huggingface/transformers').then((tf) => {
      // Sem busca local: sempre HF Hub (e sem 404 no dev server do Vite).
      tf.env.allowLocalModels = false;
      return tf;
    });
  }
  return tfPromise;
}

// Agregação de progresso por arquivo: transformers.js emite um evento por arquivo.
const fileProgress = new Map<string, { loaded: number; total: number }>();

function handleProgress(data: unknown): void {
  if (!isRecord(data)) return;
  const file = typeof data.file === 'string' ? data.file : typeof data.name === 'string' ? data.name : null;
  const loaded = typeof data.loaded === 'number' ? data.loaded : 0;
  const total = typeof data.total === 'number' ? data.total : 0;
  if (!file) return;
  const cur = fileProgress.get(file);
  if (cur && loaded < cur.loaded && total === cur.total) {
    // Novo arquivo com mesmo nome (retry): recomeça.
    fileProgress.clear();
  }
  if (total > 0) fileProgress.set(file, { loaded, total });
  else if (cur) fileProgress.set(file, { loaded: Math.max(cur.loaded, loaded), total: cur.total });

  let sumLoaded = 0;
  let sumTotal = 0;
  for (const p of fileProgress.values()) {
    sumLoaded += p.loaded;
    sumTotal += p.total;
  }
  setBgModelStatus({
    phase: 'downloading',
    progress: sumTotal > 0 ? Math.min(1, sumLoaded / sumTotal) : 0,
    loadedBytes: sumLoaded,
    totalBytes: sumTotal,
  });
}

/**
 * Garante o modelo carregado (download único → cache do navegador).
 * WebGPU + fp16; se o adaptador não comportar o grafo, cai para wasm + fp32.
 */
export async function ensureBgModel(): Promise<void> {
  if (!modelPromise) {
    modelPromise = loadModel().catch((err: unknown) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

async function loadModel(): Promise<void> {
  setBgModelStatus({ phase: 'downloading', progress: 0, loadedBytes: 0, totalBytes: 0, error: null });
  fileProgress.clear();
  try {
    const tf = await loadTransformers();
    if (!isTensorCtor(tf.Tensor)) throw new Error('bg-model');
    tensorCtor = tf.Tensor;
    const webgpu = bgUsesWebGPU();
    try {
      bgModel = await tf.AutoModel.from_pretrained(BG_MODEL_ID, {
        device: webgpu ? 'webgpu' : 'wasm',
        dtype: webgpu ? 'fp16' : 'fp32',
        progress_callback: handleProgress,
      });
    } catch (err) {
      if (!webgpu) throw err;
      // Adaptador sem storage buffers p/ o grafo: recarrega em wasm/fp32.
      console.warn('[bgRemoval] WebGPU falhou, caindo para wasm:', err);
      fileProgress.clear();
      setBgModelStatus({ phase: 'downloading', progress: 0, loadedBytes: 0, totalBytes: 0 });
      bgModel = await tf.AutoModel.from_pretrained(BG_MODEL_ID, {
        device: 'wasm',
        dtype: 'fp32',
        progress_callback: handleProgress,
      });
    }
    if (!isModelInvoke(bgModel)) throw new Error('bg-model');
    setBgModelReady();
  } catch (err) {
    console.warn('[bgRemoval] Falha ao preparar a ferramenta de recorte:', err);
    setBgModelError('bg-model');
    throw new Error('bg-model');
  }
}

// ------------------------------------------------------------- pipeline

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('bg-load'));
    img.src = url;
  });
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('bg-canvas');
  return { canvas, ctx };
}

/** Pré-processo idêntico ao ViTFeatureExtractor do modelo: 512² RGB NCHW. */
function buildInputTensor(img: HTMLImageElement): TfTensor {
  if (!tensorCtor) throw new Error('bg-model');
  const { ctx } = makeCanvas(MODEL_INPUT, MODEL_INPUT);
  ctx.drawImage(img, 0, 0, MODEL_INPUT, MODEL_INPUT);
  const { data } = ctx.getImageData(0, 0, MODEL_INPUT, MODEL_INPUT);
  const plane = MODEL_INPUT * MODEL_INPUT;
  const floats = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    floats[i] = (data[i * 4] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    floats[plane + i] = (data[i * 4 + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    floats[2 * plane + i] = (data[i * 4 + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  return new tensorCtor('float32', floats, [1, 3, MODEL_INPUT, MODEL_INPUT]);
}

/**
 * Roda a inferência e devolve o matte 512² já com sigmoid.
 * Procura o mapa de logits entre os nomes de saída conhecidos dos exports
 * BiRefNet (`logits` no studioludens, `output_image`/`output` em outros).
 */
async function runInference(input: TfTensor): Promise<Float32Array> {
  if (!isModelInvoke(bgModel)) throw new Error('bg-inference');
  const plane = MODEL_INPUT * MODEL_INPUT;
  const out = await bgModel({ input_image: input });
  for (const key of ['logits', 'output_image', 'output']) {
    const candidate: unknown = out[key];
    if (!isTensorLike(candidate)) continue;
    const data: unknown = candidate.data;
    const matte = new Float32Array(plane);
    if (data instanceof Float32Array && data.length === plane) {
      matte.set(data);
    } else if (data instanceof Uint16Array && data.length === plane) {
      // Saída fp16 (WebGPU): half-float → float.
      for (let i = 0; i < plane; i++) matte[i] = fromHalfFloat(data[i]);
    } else if (isNumberIndexable(data) && data.length === plane) {
      for (let i = 0; i < plane; i++) matte[i] = data[i];
    } else {
      continue;
    }
    sigmoidInPlace(matte);
    return matte;
  }
  throw new Error('bg-inference');
}

/** Matte 512² → alpha full-res via bilinear do próprio canvas. */
function upscaleMatte(matte: Float32Array, width: number, height: number): Float32Array {
  const src = makeCanvas(MODEL_INPUT, MODEL_INPUT);
  const imgData = src.ctx.createImageData(MODEL_INPUT, MODEL_INPUT);
  for (let i = 0; i < matte.length; i++) {
    const v = matte[i] * 255;
    imgData.data[i * 4] = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  src.ctx.putImageData(imgData, 0, 0);

  const dst = makeCanvas(width, height);
  dst.ctx.imageSmoothingEnabled = true;
  dst.ctx.imageSmoothingQuality = 'high';
  dst.ctx.drawImage(src.canvas, 0, 0, width, height);
  const out = dst.ctx.getImageData(0, 0, width, height);
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = out.data[i * 4] / 255;
  return alpha;
}

/** Plano RGB [0..1] intercalado + alpha na resolução de trabalho da decontamination. */
function buildWorkPlanes(
  canvasFull: HTMLCanvasElement,
  alphaFull: Float32Array,
  width: number,
  height: number,
  workWidth: number,
  workHeight: number,
): { rgb: Float32Array; alpha: Float32Array } {
  const work = makeCanvas(workWidth, workHeight);
  work.ctx.imageSmoothingEnabled = true;
  work.ctx.imageSmoothingQuality = 'high';
  work.ctx.drawImage(canvasFull, 0, 0, workWidth, workHeight);
  const { data } = work.ctx.getImageData(0, 0, workWidth, workHeight);
  const n = workWidth * workHeight;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = data[i * 4] / 255;
    rgb[i * 3 + 1] = data[i * 4 + 1] / 255;
    rgb[i * 3 + 2] = data[i * 4 + 2] / 255;
  }
  const alpha = downsamplePlane(alphaFull, width, height, workWidth, workHeight);
  return { rgb, alpha };
}

/** WebP com alpha; JPEG jamais (sem transparência) — fallback PNG. */
async function encodeCutout(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await canvasToBlob(canvas, 'image/webp', IMAGE_WEBP_QUALITY);
  if (webp.type === 'image/webp') return webp;
  // PNG ignora o quality; o terceiro parâmetro só cumpre a assinatura.
  return canvasToBlob(canvas, 'image/png', 1);
}

/**
 * Recorta o fundo da imagem `url` conforme o modo. Devolve um Blob com alpha
 * (WebP ou PNG) nas mesmas dimensões — pronto p/ `registerProcessedImage`.
 */
export async function removeBackground(
  url: string,
  width: number,
  height: number,
  mode: BgRemovalMode,
): Promise<BgRemovalResult> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('bg-load');
  }
  const preset = BG_REMOVAL_PRESETS[mode];
  await ensureBgModel();

  const img = await loadImage(url);
  const input = buildInputTensor(img);
  const matte = await runInference(input);

  // Pós-processo na resolução nativa do matte (parâmetros em px do modelo).
  let alpha = matte;
  if (preset.median) alpha = median3x3(alpha, MODEL_INPUT, MODEL_INPUT);
  smoothstepCurve(alpha, preset.smoothEdge0, preset.smoothEdge1);
  gammaCurve(alpha, preset.gamma);
  if (preset.erode) alpha = erode3x3(alpha, MODEL_INPUT, MODEL_INPUT);
  if (preset.featherSigma > 0) alpha = gaussianBlur(alpha, MODEL_INPUT, MODEL_INPUT, preset.featherSigma);

  const alphaFull = upscaleMatte(alpha, width, height);

  const out = makeCanvas(width, height);
  out.ctx.drawImage(img, 0, 0, width, height);
  const imageData = out.ctx.getImageData(0, 0, width, height);

  if (preset.decontaminate) {
    const dims = downscaleDimensions(width, height, DECONTAM_MAX_SIDE);
    const { rgb, alpha: workAlpha } = buildWorkPlanes(out.canvas, alphaFull, width, height, dims.width, dims.height);
    const fg = fbFusionForeground(rgb, workAlpha, dims.width, dims.height);
    applyCutoutData(imageData.data, width, height, alphaFull, fg, dims.width, dims.height);
  } else {
    applyCutoutData(imageData.data, width, height, alphaFull, null, 0, 0);
  }
  out.ctx.putImageData(imageData, 0, 0);

  const blob = await encodeCutout(out.canvas);
  return { blob, width, height };
}

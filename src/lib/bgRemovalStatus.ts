import { createExternalStore } from './createExternalStore';

/**
 * Estado reativo da ferramenta de recorte (remoção de fundo).
 *
 * `model` acompanha o ciclo de vida do modelo ONNX (download único → cache do
 * navegador); `processing` marca a imagem da folha que está sendo recortada.
 * Padrão module-level igual ao registry de `userImages.ts`, para o diálogo,
 * o chip de progresso e os botões reagirem ao mesmo snapshot.
 */

/** Modos de recorte calibrados: 🧑 pessoa (matting suave) vs 📦 objeto (borda firme). */
export type BgRemovalMode = 'person' | 'object';

export type BgModelPhase = 'idle' | 'downloading' | 'ready' | 'error';

export interface BgModelStatus {
  phase: BgModelPhase;
  /** Progresso agregado do download, 0–1. */
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  /** Código interno do erro (`bg-model` = falha no download/preparo). */
  error: string | null;
}

export interface BgProcessing {
  imageElId: string;
  mode: BgRemovalMode;
  label: string;
}

const IDLE_MODEL: BgModelStatus = {
  phase: 'idle',
  progress: 0,
  loadedBytes: 0,
  totalBytes: 0,
  error: null,
};

const modelStore = createExternalStore<BgModelStatus>(IDLE_MODEL);
const processingStore = createExternalStore<BgProcessing | null>(null);

/** Estado do modelo (download/cache) reativo para a UI. */
export function useBgModelStatus(): BgModelStatus {
  return modelStore.use();
}

/** Recorte em andamento (ou null) reativo para a UI. */
export function useBgProcessing(): BgProcessing | null {
  return processingStore.use();
}

export function getBgModelStatus(): BgModelStatus {
  return modelStore.get();
}

export function getBgProcessing(): BgProcessing | null {
  return processingStore.get();
}

export function setBgModelStatus(patch: Partial<BgModelStatus>): void {
  modelStore.patch(patch);
}

export function setBgModelReady(): void {
  modelStore.patch({ phase: 'ready', progress: 1, error: null });
}

export function setBgModelError(code: string): void {
  modelStore.patch({ phase: 'error', error: code });
}

export function beginBgProcessing(next: BgProcessing): void {
  processingStore.set(next);
}

export function endBgProcessing(): void {
  processingStore.set(null);
}

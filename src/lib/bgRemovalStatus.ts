import { useSyncExternalStore } from 'react';

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

let modelStatus: BgModelStatus = IDLE_MODEL;
let processing: BgProcessing | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Estado do modelo (download/cache) reativo para a UI. */
export function useBgModelStatus(): BgModelStatus {
  return useSyncExternalStore(subscribe, () => modelStatus);
}

/** Recorte em andamento (ou null) reativo para a UI. */
export function useBgProcessing(): BgProcessing | null {
  return useSyncExternalStore(subscribe, () => processing);
}

export function getBgModelStatus(): BgModelStatus {
  return modelStatus;
}

export function getBgProcessing(): BgProcessing | null {
  return processing;
}

export function setBgModelStatus(patch: Partial<BgModelStatus>): void {
  modelStatus = { ...modelStatus, ...patch };
  emit();
}

export function setBgModelReady(): void {
  setBgModelStatus({ phase: 'ready', progress: 1, error: null });
}

export function setBgModelError(code: string): void {
  setBgModelStatus({ phase: 'error', error: code });
}

export function beginBgProcessing(next: BgProcessing): void {
  processing = next;
  emit();
}

export function endBgProcessing(): void {
  processing = null;
  emit();
}

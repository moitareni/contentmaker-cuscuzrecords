import { useSyncExternalStore } from 'react';
import {
  IMAGE_THUMB_SIDE,
  IMAGE_WEBP_QUALITY,
  downscaleDimensions,
  imageFileLabel,
  isImageFileTooBig,
  isSupportedImageFile,
} from './imageRules';

/**
 * Imagens enviadas pelo usuário.
 *
 * O blob processado e a miniatura vivem no IndexedDB (cota muito maior que o
 * localStorage, onde o rascunho leve do doc não daria conta de uma foto em
 * base64). Em memória, um registry de object URLs alimenta o Konva e a lista
 * do painel; o elemento no doc guarda só metadados + `imageId`.
 */

export interface UserImageEntry {
  id: string;
  name: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

interface StoredImage {
  id: string;
  blob: Blob;
  thumb: Blob;
  name: string;
  width: number;
  height: number;
  createdAt: number;
}

const DB_NAME = 'cuscuz-insta-kit';
const DB_VERSION = 1;
const STORE = 'images';

// ---------------------------------------------------------------- registry

const entries = new Map<string, UserImageEntry>();
/** IDs que existem no IndexedDB (separado dos da sessão para o GC não revogar URL de imagem só-em-sessão). */
const storedIds = new Set<string>();
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getEntry(id: string | null | undefined): UserImageEntry | null {
  return id ? entries.get(id) ?? null : null;
}

/** Hook de leitura reativa: devolve o registro do registry (null se indisponível). */
export function useUserImage(imageId: string | null): UserImageEntry | null {
  return useSyncExternalStore(subscribe, () => getEntry(imageId));
}

function addEntry(entry: UserImageEntry, stored: boolean) {
  entries.set(entry.id, entry);
  if (stored) storedIds.add(entry.id);
  emit();
}

async function removeEntry(id: string) {
  const entry = entries.get(id);
  entries.delete(id);
  storedIds.delete(id);
  if (entry) {
    URL.revokeObjectURL(entry.url);
    URL.revokeObjectURL(entry.thumbUrl);
  }
  emit();
  try {
    const db = await openDb();
    await requestAsPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  } catch {
    // Banco indisponível: a URL já foi revogada; segue o jogo.
  }
}

// ------------------------------------------------------------ IndexedDB puro

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb-indisponivel'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb-erro'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function requestAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb-erro'));
  });
}

async function getAllStored(): Promise<StoredImage[]> {
  const db = await openDb();
  return requestAsPromise(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<StoredImage[]>);
}

async function putStored(rec: StoredImage): Promise<void> {
  const db = await openDb();
  await requestAsPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec));
}

// --------------------------------------------------------------- hidratação

/**
 * Carrega em memória todas as imagens gravadas no IndexedDB.
 * Devolve os IDs disponíveis para o doc reconcilar os elementos.
 */
export async function hydrateUserImages(): Promise<Set<string>> {
  try {
    const all = await getAllStored();
    for (const rec of all) {
      addEntry(storedToEntry(rec), true);
    }
    hydrated = true;
  } catch {
    // IndexedDB bloqueado/ausente: modo só-em-sessão.
    hydrated = false;
  }
  return new Set(entries.keys());
}

function storedToEntry(rec: StoredImage): UserImageEntry {
  return {
    id: rec.id,
    name: rec.name,
    url: URL.createObjectURL(rec.blob),
    thumbUrl: URL.createObjectURL(rec.thumb),
    width: rec.width,
    height: rec.height,
  };
}

/**
 * Remove do banco e da memória as imagens que o doc atual não referencia.
 * Só mexe em registros vindos do IndexedDB: imagens só-em-sessão ficam
 * intactas (o undo pode trazê-las de volta).
 */
export async function collectGarbageImages(keep: Set<string>): Promise<void> {
  if (!hydrated) return;
  const orphans = [...storedIds].filter((id) => !keep.has(id));
  for (const id of orphans) {
    await removeEntry(id);
  }
}

// ------------------------------------------------------------- importação

export interface ImportedImage {
  entry: UserImageEntry;
  /** false = IndexedDB indisponível; a imagem só vive nesta sessão. */
  persisted: boolean;
}

/**
 * Registra uma imagem já processada (ex.: recorte sem fundo) sem passar pela
 * validação de arquivo: gera a miniatura, grava no IndexedDB e alimenta o
 * registry com as URLs para o canvas.
 */
export async function registerProcessedImage(
  blob: Blob,
  name: string,
  width: number,
  height: number,
): Promise<ImportedImage> {
  if (!blob.type.startsWith('image/')) throw new Error('encode');
  const decoded = await decodeImageSource(blob);
  let result: ImportedImage;
  try {
    const thumbDims = downscaleDimensions(decoded.width, decoded.height, IMAGE_THUMB_SIDE);
    const thumb = await renderToBlob(decoded.source, thumbDims.width, thumbDims.height);

    const entry: UserImageEntry = {
      id: uid(),
      name,
      url: URL.createObjectURL(blob),
      thumbUrl: URL.createObjectURL(thumb),
      width,
      height,
    };

    let persisted = true;
    try {
      await putStored({
        id: entry.id,
        blob,
        thumb,
        name: entry.name,
        width,
        height,
        createdAt: Date.now(),
      });
    } catch {
      persisted = false;
    }
    addEntry(entry, persisted);
    result = { entry, persisted };
  } finally {
    decoded.close();
  }
  return result;
}

/**
 * Fluxo completo de importação: valida, decodifica, redimensiona, encoda,
 * grava no IndexedDB e registra as URLs para o canvas.
 */
export async function importUserImage(file: File): Promise<ImportedImage> {
  if (!isSupportedImageFile(file)) throw new Error('tipo-nao-suportado');
  if (isImageFileTooBig(file)) throw new Error('arquivo-grande');

  const decoded = await decodeImageSource(file);
  let result: ImportedImage;
  try {
    const dims = downscaleDimensions(decoded.width, decoded.height);
    if (!dims.width || !dims.height) throw new Error('decode');

    const blob = await renderToBlob(decoded.source, dims.width, dims.height);
    const thumbDims = downscaleDimensions(decoded.width, decoded.height, IMAGE_THUMB_SIDE);
    const thumb = await renderToBlob(decoded.source, thumbDims.width, thumbDims.height);

    const entry: UserImageEntry = {
      id: uid(),
      name: imageFileLabel(file.name),
      url: URL.createObjectURL(blob),
      thumbUrl: URL.createObjectURL(thumb),
      width: dims.width,
      height: dims.height,
    };

    let persisted = true;
    try {
      await putStored({
        id: entry.id,
        blob,
        thumb,
        name: entry.name,
        width: dims.width,
        height: dims.height,
        createdAt: Date.now(),
      });
    } catch {
      persisted = false;
    }
    addEntry(entry, persisted);
    result = { entry, persisted };
  } finally {
    decoded.close();
  }
  return result;
}

// ------------------------------------------------- decode / render / encode

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeImageSource(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Formato suportado pelo <img> mas não pelo createImageBitmap (ex.: alguns GIFs/AVIF).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function drawToCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-2d-indisponivel');
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode'))),
      type,
      quality,
    );
  });
}

/** WebP primeiro; se o navegador não encodar (ou cair para PNG), vai de JPEG. */
async function renderToBlob(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = drawToCanvas(source, width, height);
  try {
    const webp = await canvasToBlob(canvas, 'image/webp', IMAGE_WEBP_QUALITY);
    if (webp.type === 'image/webp') return webp;
  } catch {
    // Fallback abaixo.
  }
  return canvasToBlob(canvas, 'image/jpeg', IMAGE_WEBP_QUALITY);
}

function uid(): string {
  return `img-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// ------------------------------------------------------------------- export

/**
 * Garante que as imagens referenciadas estão decodificadas antes de exportar:
 * o `stage.toDataURL` captura nodes com a imagem ainda a meio caminho do load.
 */
export async function ensureUserImagesReady(
  ids: Iterable<string>,
  timeoutMs = 3000,
): Promise<void> {
  const urls = [...new Set([...ids].map((id) => getEntry(id)).filter((e): e is UserImageEntry => !!e).map((e) => e.url))];
  await Promise.race([
    Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
            setTimeout(resolve, timeoutMs);
          }),
      ),
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export { getEntry as getUserImageEntry };

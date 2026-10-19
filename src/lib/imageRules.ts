import { IMAGE_MAX_COUNT, IMAGE_MAX_FILE_BYTES, IMAGE_MAX_SIDE, POST_H, POST_W } from '../brand/brand';
import type { El } from '../types';

/** Qualidade do encode WebP das imagens do usuário. */
export const IMAGE_WEBP_QUALITY = 0.92;
/** Lado maior da miniatura usada na lista do painel. */
export const IMAGE_THUMB_SIDE = 320;

/** Tipos raster aceitos. SVG fica de fora por segurança (pode carregar script). */
const SUPPORTED_MIME = /^(image\/(png|jpeg|webp|gif|avif|bmp))$/i;

export function isSupportedImageFile(file: { type: string }): boolean {
  const type = (file.type || '').toLowerCase();
  return SUPPORTED_MIME.test(type);
}

export function isImageFileTooBig(file: { size: number }): boolean {
  return file.size > IMAGE_MAX_FILE_BYTES;
}

/** Converte um File em rótulo curto para o painel (sem extensão, máx. 40 chars). */
export function imageFileLabel(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const label = base || 'Imagem';
  return label.length > 40 ? `${label.slice(0, 39)}…` : label;
}

/**
 * Dimensões processadas: o maior lado nunca passa de `maxSide`.
 * Nunca amplia — imagem pequena entra no tamanho natural.
 */
export function downscaleDimensions(
  width: number,
  height: number,
  maxSide = IMAGE_MAX_SIDE,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const largest = Math.max(width, height);
  if (largest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const k = maxSide / largest;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/**
 * Escala inicial da imagem ao entrar na folha: ocupa no máximo ~70% da
 * largura/altura do post, sem ampliações (evita desfocar foto pequena).
 */
export function initialImageScale(width: number, height: number, fill = 0.7): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.min(1, (POST_W * fill) / width, (POST_H * fill) / height);
}

/** Mantém o centro do drop dentro da folha (0 ≥ x ≥ POST_W, 0 ≥ y ≥ POST_H). */
export function clampImageCenter(x: number, y: number): { x: number; y: number } {
  const cx = Number.isFinite(x) ? x : POST_W / 2;
  const cy = Number.isFinite(y) ? y : POST_H / 2;
  return { x: Math.min(POST_W, Math.max(0, cx)), y: Math.min(POST_H, Math.max(0, cy)) };
}

export function countImages(elements: El[]): number {
  return elements.reduce((n, e) => (e.kind === 'image' ? n + 1 : n), 0);
}

export function hasImageSlots(elements: El[]): boolean {
  return countImages(elements) < IMAGE_MAX_COUNT;
}

/** Elemento de imagem que pode existir no doc persistido (metadados completos). */
export function isPersistedImage(el: El): boolean {
  return el.kind === 'image' && !!el.imageId && el.width > 0 && el.height > 0;
}

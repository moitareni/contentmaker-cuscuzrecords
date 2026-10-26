import type { BorderKind, BrandColor, GrainSize, TextStyle } from './brand/brand';
export type { BorderKind, BrandColor, TextStyle };

export interface BaseEl {
  id: string;
  /** Centro do elemento, em px do post (1080×1440). */
  x: number;
  y: number;
  rotation: number;
  /** Escala uniforme (sempre positiva). Textos mantêm scale=1 e usam fontSize. */
  scale: number;
}

export interface DecorationEl extends BaseEl {
  kind: 'decoration';
  assetId: string;
  flipX: boolean;
  flipY: boolean;
}

export interface TextEl extends BaseEl {
  kind: 'text';
  style: TextStyle;
  text: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  color: BrandColor;
  brandEffect: boolean;
  border: BorderKind;
}

export interface LogoEl extends BaseEl {
  kind: 'logo';
  variant: 'paper' | 'clean';
}

export interface ImageEl extends BaseEl {
  kind: 'image';
  /** Chave do registro no IndexedDB (src/lib/userImages). */
  imageId: string;
  name: string;
  /** Dimensões naturais em px, já no tamanho processado (máx. 3000 no maior lado). */
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
  /**
   * Imagem anterior ao recorte sem fundo — alimenta o botão "Reverter fundo".
   * Vai no doc (persiste) e precisa ser considerada pelo GC do IndexedDB.
   */
  cutFrom?: ImageMeta;
}

/** Metadados de uma imagem do usuário (o binário vive no IndexedDB). */
export interface ImageMeta {
  imageId: string;
  name: string;
  width: number;
  height: number;
}

export type El = DecorationEl | ImageEl | TextEl | LogoEl;
export type ElKind = El['kind'];

export interface Doc {
  backgroundId: string | null;
  backgroundFlipX?: boolean;
  backgroundFlipY?: boolean;
  /** Ordem do array = ordem das camadas (último fica por cima). */
  elements: El[];
}

export type StepId = 0 | 1 | 2 | 3 | 4 | 5;
export const STEP_OF_KIND: Record<ElKind, StepId> = { decoration: 1, image: 2, text: 3, logo: 4 };
export const LAST_STEP: StepId = 5;

/** Acabamento do post (passo 6). Fora de `elements`: nunca selecionável. */
export interface PaperFinish {
  enabled: boolean;
  /** Opacidade 0–100. */
  opacity: number;
}
export interface GrainFinish {
  enabled: boolean;
  /** Intensidade 0–100 (vira opacidade do overlay). */
  intensity: number;
  size: GrainSize;
}
export interface BorderTextureFinish {
  enabled: boolean;
  /** Opacidade 0–100. */
  opacity: number;
}
export interface FinishState {
  paper: PaperFinish;
  grain: GrainFinish;
  borderTexture: BorderTextureFinish;
}

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

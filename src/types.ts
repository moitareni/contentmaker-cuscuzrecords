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

export type El = DecorationEl | TextEl | LogoEl;
export type ElKind = El['kind'];

export interface Doc {
  backgroundId: string | null;
  /** Ordem do array = ordem das camadas (último fica por cima). */
  elements: El[];
}

export type StepId = 0 | 1 | 2 | 3 | 4;
export const STEP_OF_KIND: Record<ElKind, StepId> = { decoration: 1, text: 2, logo: 3 };

/** Acabamento do post (passo 5). Fora de `elements`: nunca selecionável. */
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
export interface FinishState {
  paper: PaperFinish;
  grain: GrainFinish;
}

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

import manifestJson from './assets-manifest.json';

export interface BackgroundAsset {
  id: string;
  category: 'pronto' | 'puro';
  label: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
}
export type DecorationCategory = 'enfeite' | 'grafismo' | 'janela';
/** 'divide' não existe no canvas: o asset vem com RGB invertido e é desenhado em color-dodge. */
export type DecorationBlend = 'soft-light' | 'divide';
export interface DecorationAsset {
  id: string;
  category: DecorationCategory;
  label: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
  blend?: DecorationBlend;
  /** Folha inteira 1080×1440 (grade/sobrepor): nasce centralizada, sem posicionamento rápido. */
  fullSheet?: boolean;
}
export interface LogoAsset {
  id: 'paper' | 'clean';
  label: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
}
export interface PaperTextureAsset {
  src: string;
  thumb: string;
  width: number;
  height: number;
}
interface Manifest {
  post: { width: number; height: number };
  backgrounds: BackgroundAsset[];
  decorations: DecorationAsset[];
  logos: LogoAsset[];
  borderTexture: { src: string; width: number; height: number };
  paperTexture: PaperTextureAsset;
}

export const manifest = manifestJson as Manifest;

export const getBackground = (id: string | null) => manifest.backgrounds.find((b) => b.id === id) ?? null;
export const getDecoration = (id: string) => manifest.decorations.find((d) => d.id === id) ?? null;
export const decorationsOf = (category: DecorationCategory) =>
  manifest.decorations.filter((d) => d.category === category);
/** Operação de composição do canvas para o blend do asset (undefined = normal). */
export const canvasBlendOf = (blend: DecorationBlend | undefined): GlobalCompositeOperation | undefined =>
  blend === 'divide' ? 'color-dodge' : blend;
export const getLogo = (id: LogoAsset['id']) => manifest.logos.find((l) => l.id === id)!;
/** Textura de papel do acabamento. Null até o `npm run assets` gerar (ou asset removido). */
export const getPaperTexture = () => manifest.paperTexture ?? null;
/** Textura da borda usada tanto na borda de texto quanto no acabamento (passo 6, overlay). */
export const getBorderTexture = () => manifest.borderTexture ?? null;

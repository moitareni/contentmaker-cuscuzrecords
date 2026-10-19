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
export interface DecorationAsset {
  id: string;
  label: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
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
export const getLogo = (id: LogoAsset['id']) => manifest.logos.find((l) => l.id === id)!;
/** Textura de papel do acabamento. Null até o `npm run assets` gerar (ou asset removido). */
export const getPaperTexture = () => manifest.paperTexture ?? null;

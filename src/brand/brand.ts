/**
 * Regras da identidade visual da Cuscuz Records.
 * TUDO que é "da marca" (cores, fontes, presets de texto, bordas, enfeites) vive aqui.
 */

export const POST_W = 1080;
export const POST_H = 1440;

export const COLORS = {
  preto: '#0b0500',
  barro: '#942911',
  amarelo: '#f8ce2b',
  amareloQuente: '#f6c01f',
  verde: '#698f3f',
  creme: '#f7ebcd',
} as const;

export type BrandColor = keyof typeof COLORS;

export const COLOR_LABELS: Record<BrandColor, string> = {
  preto: 'Preto',
  barro: 'Barro',
  amarelo: 'Amarelo',
  amareloQuente: 'Amarelo Quente',
  verde: 'Verde Ceará',
  creme: 'Creme',
};

export const FONT_HEADLINE = 'Londrina Solid';
export const FONT_BODY = 'PT Sans Narrow';

export type TextStyle = 'title' | 'body' | 'highlight';

export interface TextPreset {
  label: string;
  hint: string;
  fontFamily: string;
  fontWeight: '900' | 'bold';
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  color: BrandColor;
  brandEffect: boolean;
  border: BorderKind;
  placeholder: string;
}

export const TEXT_PRESETS: Record<TextStyle, TextPreset> = {
  title: {
    label: 'Título',
    hint: 'Londrina Solid Black',
    fontFamily: FONT_HEADLINE,
    fontWeight: '900',
    fontSize: 120,
    lineHeight: 0.95,
    letterSpacing: 0,
    uppercase: true,
    color: 'preto',
    brandEffect: false,
    border: 'none',
    placeholder: 'Título aqui',
  },
  body: {
    label: 'Texto',
    hint: 'PT Sans Narrow Bold',
    fontFamily: FONT_BODY,
    fontWeight: 'bold',
    fontSize: 44,
    lineHeight: 1.2,
    letterSpacing: 0,
    uppercase: false,
    color: 'preto',
    brandEffect: false,
    border: 'none',
    placeholder: 'Escreva seu texto aqui',
  },
  highlight: {
    label: 'Destaque',
    hint: 'Londrina com efeito',
    fontFamily: FONT_HEADLINE,
    fontWeight: '900',
    fontSize: 80,
    lineHeight: 1,
    letterSpacing: 0,
    uppercase: true,
    color: 'preto',
    brandEffect: true,
    border: 'none',
    placeholder: 'Destaque',
  },
};

/** Efeitos do Photoshop (TYPOGRAPHY.txt), em px do post 1080×1440. */
export const BRAND_EFFECT = {
  strokeColor: COLORS.creme, // traçado: 2px, externo, 100%
  strokeOutside: 2,
  shadowColor: COLORS.preto, // sombra projetada: multiplicação 46%, 90°, distância 11, tamanho 4
  shadowOpacity: 0.46,
  shadowDistance: 11,
  shadowBlur: 4,
} as const;

export type BorderKind = 'none' | 'yellow' | 'clay';

/** Bordas de destaque (BORDER/README.txt): offset retangular + TEXTURA-BORDA em "luz indireta" (soft-light). */
export const BORDERS: Record<Exclude<BorderKind, 'none'>, { label: string; color: string; textureOpacity: number }> = {
  yellow: { label: 'Amarela', color: COLORS.amarelo, textureOpacity: 1 },
  clay: { label: 'Barro', color: COLORS.barro, textureOpacity: 0.44 },
};
/** Expansão da borda em volta do texto, proporcional ao tamanho da fonte. */
export const BORDER_PAD = { x: 0.38, y: 0.2 } as const;

/** Regra: Texto (body) nunca maior que Título/Destaque. Sem títulos no post, limite fixo. */
export const BODY_MAX_WITHOUT_HEADING = 72;
export const FONT_SIZE_MIN = 16;
export const FONT_SIZE_MAX = 320;

/**
 * Canto "natural" de cada enfeite (como foi desenhado), usado no posicionamento rápido
 * para espelhar automaticamente e "abraçar" o canto escolhido.
 */
export type HAnchor = 'left' | 'right' | 'center';
export type VAnchor = 'top' | 'bottom';
export const DECORATION_ANCHORS: Record<string, { h: HAnchor; v: VAnchor }> = {
  flores: { h: 'left', v: 'bottom' },
  'folhas-1': { h: 'left', v: 'top' },
  'folhas-2': { h: 'right', v: 'top' },
  'ondas-1': { h: 'right', v: 'bottom' },
  'ondas-2': { h: 'center', v: 'top' },
};

/** Logo: larguras dos tamanhos rápidos e margem das posições rápidas. */
export const LOGO_SIZES = { P: 200, M: 320, G: 460 } as const;
export type LogoSize = keyof typeof LOGO_SIZES;
export const LOGO_MARGIN = 56;

/** Imagens do usuário: no máximo 5 por post. */
export const IMAGE_MAX_COUNT = 5;
export const IMAGE_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 3000;

/**
 * Guias de layout estilo Photoshop (margens + centro + terços).
 * Tudo em px do post 1080×1440. Não entram no export.
 */
export const GUIDE_MARGIN_DEFAULT = LOGO_MARGIN;
export const GUIDE_MARGIN_PRESETS = [32, 56, 80, 100] as const;
export const GUIDE_MARGIN_MIN = 0;
export const GUIDE_MARGIN_MAX = 160;
export const GUIDE_SNAP_THRESHOLD = 8;
export const GUIDE_COLORS = {
  margin: COLORS.barro,
  center: COLORS.verde,
  third: COLORS.preto,
} as const;

/**
 * Acabamento do post (passo 6: Textura). Tudo desligado por padrão.
 * Papel amassado em multiply + granulado monocromático em overlay.
 */
/** Texturas (papel e granulado) iniciam desligadas; o usuário liga quando quiser. */
export const FINISH_ENABLED_DEFAULT = false;
export const PAPER_OPACITY_MIN = 0;
export const PAPER_OPACITY_MAX = 100;
export const PAPER_OPACITY_DEFAULT = 40;
export const BORDER_TEXTURE_OPACITY_MIN = 0;
export const BORDER_TEXTURE_OPACITY_MAX = 100;
export const BORDER_TEXTURE_OPACITY_DEFAULT = 40;
export const GRAIN_INTENSITY_MIN = 0;
export const GRAIN_INTENSITY_MAX = 100;
export const GRAIN_INTENSITY_DEFAULT = 50;
export type GrainSize = 'P' | 'M' | 'G';
export const GRAIN_SIZES: Record<GrainSize, { label: string; hint: string; patternScale: number }> = {
  P: { label: 'P', hint: 'Grão fino', patternScale: 0.5 },
  M: { label: 'M', hint: 'Grão médio', patternScale: 1 },
  G: { label: 'G', hint: 'Grão grosso', patternScale: 2 },
};
export const GRAIN_SIZE_DEFAULT: GrainSize = 'P';
export const GRAIN_TILE_SIZE = 512;
export const GRAIN_SEED = 20261016;
export const GRAIN_STDDEV = 30;

/**
 * Zoom da folha (multiplicador sobre o ajuste à tela; 1 = ajustado).
 * O % exibido é escala real: 100% = 1px do post = 1px na tela.
 */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

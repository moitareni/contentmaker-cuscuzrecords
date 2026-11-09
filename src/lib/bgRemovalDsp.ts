/**
 * Processamento de imagem puro do pipeline de remoção de fundo (DSP).
 *
 * Funções sem estado e sem acesso a DOM/modelo: curvas de alpha, filtros
 * espaciais, fusão de cor (FB blur fusion) e amostragem bilinear. Testadas
 * em `bgRemoval.test.ts`; a orquestração do modelo IA vive em `bgRemoval.ts`.
 */

/** Pixels com alpha a partir daqui são considerados interior sólido. */
export const EDGE_BAND_ALPHA = 0.98;

export function sigmoidInPlace(x: Float32Array): void {
  for (let i = 0; i < x.length; i++) {
    x[i] = 1 / (1 + Math.exp(-x[i]));
  }
}

export function smoothstepCurve(a: Float32Array, edge0: number, edge1: number): void {
  const d = edge1 - edge0;
  if (d <= 0) throw new Error('bg-params');
  for (let i = 0; i < a.length; i++) {
    const t = Math.min(1, Math.max(0, (a[i] - edge0) / d));
    a[i] = t * t * (3 - 2 * t);
  }
}

export function gammaCurve(a: Float32Array, gamma: number): void {
  if (gamma <= 0) throw new Error('bg-params');
  for (let i = 0; i < a.length; i++) {
    a[i] = Math.pow(a[i], gamma);
  }
}

/** Median 3×3 com bordas presas (clamp) — remove sujeirinha sem comer borda. */
export function median3x3(src: Float32Array, width: number, height: number): Float32Array {
  const dst = new Float32Array(src.length);
  const win = new Float32Array(9);
  for (let y = 0; y < height; y++) {
    const y0 = (y > 0 ? y - 1 : 0) * width;
    const y1 = y * width;
    const y2 = (y < height - 1 ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x2 = x < width - 1 ? x + 1 : width - 1;
      win[0] = src[y0 + x0];
      win[1] = src[y0 + x];
      win[2] = src[y0 + x2];
      win[3] = src[y1 + x0];
      win[4] = src[y1 + x];
      win[5] = src[y1 + x2];
      win[6] = src[y2 + x0];
      win[7] = src[y2 + x];
      win[8] = src[y2 + x2];
      // Insertion sort de 9: barato e estável o bastante p/ mediana.
      for (let i = 1; i < 9; i++) {
        const v = win[i];
        let j = i - 1;
        while (j >= 0 && win[j] > v) {
          win[j + 1] = win[j];
          j -= 1;
        }
        win[j + 1] = v;
      }
      dst[y1 + x] = win[4];
    }
  }
  return dst;
}

/** Erosão 3×3 (mínimo da vizinhança) — encolhe a máscara 1px p/ matar halo. */
export function erode3x3(src: Float32Array, width: number, height: number): Float32Array {
  const dst = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const y0 = (y > 0 ? y - 1 : 0) * width;
    const y1 = y * width;
    const y2 = (y < height - 1 ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x2 = x < width - 1 ? x + 1 : width - 1;
      dst[y1 + x] = Math.min(
        src[y0 + x0],
        src[y0 + x],
        src[y0 + x2],
        src[y1 + x0],
        src[y1 + x],
        src[y1 + x2],
        src[y2 + x0],
        src[y2 + x],
        src[y2 + x2],
      );
    }
  }
  return dst;
}

/** Blur gaussiano separável com bordas presas. sigma ≤ 0 devolve cópia. */
export function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0) return src.slice();
  const radius = Math.max(1, Math.min(8, Math.ceil(sigma * 3)));
  const kernel = new Float32Array(2 * radius + 1);
  let ksum = 0;
  for (let k = -radius; k <= radius; k++) {
    const g = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + radius] = g;
    ksum += g;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ksum;

  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  // horizontal
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[row + xx] * kernel[k + radius];
      }
      tmp[row + x] = acc;
    }
  }
  // vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        acc += tmp[yy * width + x] * kernel[k + radius];
      }
      dst[y * width + x] = acc;
    }
  }
  return dst;
}

/**
 * Box blur separável (média) com janela deslizante e bordas presas — base do
 * FB fusion, que precisa de raios grandes (~90px) a custo O(1)/pixel.
 */
export function boxBlurPlane(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return src.slice();
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const inv = 1 / (2 * radius + 1);
  const clampX = (v: number) => Math.min(width - 1, Math.max(0, v));
  const clampY = (v: number) => Math.min(height - 1, Math.max(0, v));

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[row + clampX(k)];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum * inv;
      sum += src[row + clampX(x + radius + 1)] - src[row + clampX(x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[clampY(k) * width + x];
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum * inv;
      sum += tmp[clampY(y + radius + 1) * width + x] - tmp[clampY(y - radius) * width + x];
    }
  }
  return dst;
}

const FB_EPS = 1e-5;

/** Uma passada do estimador FB blur fusion (Photoroom fast-foreground-estimation). */
function fbPass(
  image: Float32Array,
  fg: Float32Array,
  bg: Float32Array,
  alpha: Float32Array,
  width: number,
  height: number,
  radius: number,
): { fg: Float32Array; bg: Float32Array } {
  const n = width * height;
  const blurredAlpha = boxBlurPlane(alpha, width, height, radius);
  const fgEst = new Float32Array(n * 3);
  const bgEst = new Float32Array(n * 3);

  const fgA = new Float32Array(n);
  const bg1A = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      fgA[i] = fg[i * 3 + c] * a;
      bg1A[i] = bg[i * 3 + c] * (1 - a);
    }
    const blurredFgA = boxBlurPlane(fgA, width, height, radius);
    const blurredBg1A = boxBlurPlane(bg1A, width, height, radius);
    for (let i = 0; i < n; i++) {
      const ba = blurredAlpha[i];
      fgEst[i * 3 + c] = blurredFgA[i] / (ba + FB_EPS);
      bgEst[i * 3 + c] = blurredBg1A[i] / (1 - ba + FB_EPS);
    }
  }

  const outFg = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      const v = fgEst[j] + a * (image[j] - a * fgEst[j] - (1 - a) * bgEst[j]);
      outFg[j] = Math.min(1, Math.max(0, v));
    }
  }
  return { fg: outFg, bg: bgEst };
}

/**
 * Decontamination de cor das bordas: estima o foreground "puro" com duas
 * passadas de blur fusion (r grande → r fino), como no `refine_foreground`
 * oficial do BiRefNet. `rgb` e o retorno são planos RGB intercalados [0..1].
 */
export function fbFusionForeground(
  rgb: Float32Array,
  alpha: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const r1 = Math.max(6, Math.round((90 * Math.max(width, height)) / 1024));
  const pass1 = fbPass(rgb, rgb, rgb, alpha, width, height, r1);
  const pass2 = fbPass(rgb, pass1.fg, pass1.bg, alpha, width, height, 6);
  return pass2.fg;
}

/** Amostra bilinear de um plano RGB intercalado, com bordas presas. */
function sampleRgbBilinear(
  plane: Float32Array,
  width: number,
  height: number,
  u: number,
  v: number,
  out: [number, number, number],
): void {
  const x = Math.min(width - 1, Math.max(0, u));
  const y = Math.min(height - 1, Math.max(0, v));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 3;
  const i10 = (y0 * width + Math.min(width - 1, x0 + 1)) * 3;
  const i01 = (Math.min(height - 1, y0 + 1) * width + x0) * 3;
  const i11 = (Math.min(height - 1, y0 + 1) * width + Math.min(width - 1, x0 + 1)) * 3;
  for (let c = 0; c < 3; c++) {
    const top = plane[i00 + c] * (1 - fx) + plane[i10 + c] * fx;
    const bottom = plane[i01 + c] * (1 - fx) + plane[i11 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
}

/** Amostra bilinear de um plano escalar, com bordas presas. */
function samplePlaneBilinear(plane: Float32Array, width: number, height: number, u: number, v: number): number {
  const x = Math.min(width - 1, Math.max(0, u));
  const y = Math.min(height - 1, Math.max(0, v));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * width + x0;
  const i10 = y0 * width + Math.min(width - 1, x0 + 1);
  const i01 = Math.min(height - 1, y0 + 1) * width + x0;
  const i11 = Math.min(height - 1, y0 + 1) * width + Math.min(width - 1, x0 + 1);
  const top = plane[i00] * (1 - fx) + plane[i10] * fx;
  const bottom = plane[i01] * (1 - fx) + plane[i11] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Aplica o alpha no canal A do RGBA e, quando há um foreground decontaminado,
 * troca o RGB apenas na banda de borda (alpha parcial) — interior sólido
 * mantém os pixels originais em resolução máxima.
 */
export function applyCutoutData(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  alphaFull: Float32Array,
  fgWork: Float32Array | null,
  workWidth: number,
  workHeight: number,
): void {
  const rgb: [number, number, number] = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = alphaFull[i];
      const j = i * 4;
      if (fgWork !== null && a < EDGE_BAND_ALPHA) {
        const u = ((x + 0.5) * workWidth) / width - 0.5;
        const v = ((y + 0.5) * workHeight) / height - 0.5;
        sampleRgbBilinear(fgWork, workWidth, workHeight, u, v, rgb);
        rgba[j] = rgb[0] * 255;
        rgba[j + 1] = rgb[1] * 255;
        rgba[j + 2] = rgb[2] * 255;
      }
      rgba[j + 3] = a * 255;
    }
  }
}

/** Downsampling bilinear de um plano escalar para a resolução de trabalho. */
export function downsamplePlane(
  plane: Float32Array,
  width: number,
  height: number,
  workWidth: number,
  workHeight: number,
): Float32Array {
  const out = new Float32Array(workWidth * workHeight);
  for (let y = 0; y < workHeight; y++) {
    const v = ((y + 0.5) * height) / workHeight - 0.5;
    for (let x = 0; x < workWidth; x++) {
      const u = ((x + 0.5) * width) / workWidth - 0.5;
      out[y * workWidth + x] = samplePlaneBilinear(plane, width, height, u, v);
    }
  }
  return out;
}

/** half-float (fp16) IEEE 754 binary16 → number, p/ saídas WebGPU fp16. */
export function fromHalfFloat(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  const sign = s ? -1 : 1;
  if (e === 0) return sign * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1f) return f !== 0 ? NaN : sign * Infinity;
  return sign * Math.pow(2, e - 15) * (1 + f / 1024);
}

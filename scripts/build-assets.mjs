// Gera os assets otimizados do Insta Kit a partir das pastas originais da marca.
// Uso: npm run assets
//
// - Fundos, enfeites, grafismos, janela, textura e logos -> WebP LOSSLESS (idêntico pixel a pixel).
//   Se um arquivo lossless passar de 1,5 MB, é re-codificado em WebP q92 (visualmente sem perda)
//   e isso aparece no relatório.
// - Enfeites, grafismos, janela e logos têm as bordas 100% transparentes recortadas (não muda nada
//   visível). EXCEÇÃO: folhas inteiras (SOBREPOR / LUZ INDIRETA, 1080×1440) não são recortadas.
// - Modo "divisão" (GRAFISMOS/PAPEL DIVISÃO) não existe no canvas: o WebP principal sai com o RGB
//   INVERTIDO e o app aplica color-dodge (B/(1-S') com S'=1-S  ==  B/S, a divisão exata).
// - Logo "sem fundo" (3000px, ~72 MB) é reduzida para 2160px (2x a largura do post).
// - Miniaturas WebP para a interface (nunca usadas no export).
// - Escreve src/assets-manifest.json, consumido pelo app.

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const BRAND_ROOT = path.resolve(APP, '..'); // pasta com os assets originais
const OUT = path.join(APP, 'public', 'brand');
const MANIFEST = path.join(APP, 'src', 'assets-manifest.json');
const PUBLIC_PREFIX = '/brand';
const MAX_BYTES = 1.5 * 1024 * 1024;
const POST_W = 1080;
const POST_H = 1440;

sharp.cache(false);

const SOURCES = {
  presets: 'BACKGROUNDS PRESETS',
  pure: 'BACKGROUND PUROS',
  decorations: 'ENFEITE',
  graphics: 'GRAFISMOS',
  window: 'JANELA',
  border: 'BORDER',
  logo: 'LOGO',
  texture: 'TEXTURE',
};

/**
 * Ajustes por arquivo (chave = slug do nome). Sem entrada: id/label vêm do nome do arquivo.
 * - blend: modo de mesclagem aplicado no canvas ('soft-light' | 'divide').
 * - fullSheet: folha inteira 1080×1440 (não recorta transparência, nasce centralizada).
 */
const DECOR_OVERRIDES = {
  'luz-indireta': { id: 'grade', label: 'Grade', blend: 'soft-light', fullSheet: true }, // README do ENFEITE
  sobrepor: { id: 'sobrepor', label: 'Sobrepor', fullSheet: true },
  'papel-divisao': { id: 'papel-divisao', label: 'Papel divisão', blend: 'divide' }, // README do GRAFISMOS
};

const report = [];
let failed = false;

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const prettyLabel = (s) => {
  const t = s.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function listPngs(dir) {
  const full = path.join(BRAND_ROOT, dir);
  const names = (await fs.readdir(full)).filter((n) => n.toLowerCase().endsWith('.png'));
  names.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  return names.map((n) => path.join(full, n));
}

/** Bounding box dos pixels com alpha > 0. */
async function alphaBBox(file) {
  const img = sharp(file, { limitInputPixels: false }).ensureAlpha();
  const { data, info } = await img.extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width, height, full: { width, height } };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1, full: { width, height } };
}

function pipeline(file, { trimBox, resizeWidth, invertRgb }) {
  let p = sharp(file, { limitInputPixels: false });
  if (trimBox) p = p.extract({ left: trimBox.left, top: trimBox.top, width: trimBox.width, height: trimBox.height });
  if (resizeWidth) p = p.resize({ width: resizeWidth, kernel: 'lanczos3', withoutEnlargement: true });
  // Inverte só o RGB (alpha intacto): base do modo divisão (ver cabeçalho).
  if (invertRgb) p = p.negate({ alpha: false });
  return p;
}

async function encodeMain(file, outName, opts = {}) {
  const before = (await fs.stat(file)).size;
  const outFile = path.join(OUT, outName);
  let buf = await pipeline(file, opts).webp({ lossless: true, effort: 6 }).toBuffer();
  let mode = 'lossless';
  if (buf.length > MAX_BYTES) {
    buf = await pipeline(file, opts)
      .webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toBuffer();
    mode = 'q92 (visualmente sem perda)';
  }
  await fs.writeFile(outFile, buf);
  const meta = await sharp(buf).metadata();
  if (buf.length > MAX_BYTES) failed = true;
  report.push({ arquivo: path.relative(BRAND_ROOT, file), saida: outName, antes: before, depois: buf.length, modo: mode, dim: `${meta.width}x${meta.height}` });
  return { src: `${PUBLIC_PREFIX}/${outName}`, width: meta.width, height: meta.height };
}

async function encodeThumb(file, outName, { width, height, fit = 'cover', trimBox }) {
  let p = sharp(file, { limitInputPixels: false });
  if (trimBox) p = p.extract({ left: trimBox.left, top: trimBox.top, width: trimBox.width, height: trimBox.height });
  const buf = await p
    .resize({ width, height, fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
  await fs.writeFile(path.join(OUT, 'thumbs', outName), buf);
  return `${PUBLIC_PREFIX}/thumbs/${outName}`;
}

async function backgrounds(dir, category, labelPrefix) {
  const files = await listPngs(dir);
  const out = [];
  for (const [i, file] of files.entries()) {
    const meta = await sharp(file).metadata();
    if (meta.width !== POST_W || meta.height !== POST_H) {
      console.warn(`⚠  ${file} tem ${meta.width}x${meta.height} (esperado ${POST_W}x${POST_H}); será ajustado no app.`);
    }
    const id = `${category}-${i + 1}`;
    const main = await encodeMain(file, `bg-${id}.webp`);
    const thumb = await encodeThumb(file, `bg-${id}.webp`, { width: 270, height: 360 });
    out.push({ id, category, label: `${labelPrefix} ${i + 1}`, ...main, thumb });
  }
  return out;
}

/**
 * Miniatura de uma folha inteira semitransparente: aplicada sobre o 1º fundo puro com o
 * mesmo modo de mesclagem do app (senão a prévia seria quase invisível no cartão claro).
 */
async function encodeSheetThumb(file, outName, blend) {
  const pures = await listPngs(SOURCES.pure);
  const W = 240;
  const H = 320;
  const base = await sharp(pures[0]).resize(W, H, { fit: 'fill' }).toBuffer();
  const over = await sharp(file, { limitInputPixels: false }).resize(W, H, { fit: 'fill' }).toBuffer();
  const merged = await sharp(base)
    .composite([{ input: over, blend: blend === 'soft-light' ? 'soft-light' : 'over' }])
    .png()
    .toBuffer();
  const buf = await sharp(merged)
    .resize({ width: 240, height: 240, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
  await fs.writeFile(path.join(OUT, 'thumbs', outName), buf);
  return `${PUBLIC_PREFIX}/thumbs/${outName}`;
}

async function decorationGroup(dir, category) {
  const files = await listPngs(dir);
  const out = [];
  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    const ov = DECOR_OVERRIDES[slug(base)] ?? {};
    const id = ov.id ?? slug(base);
    const fullSheet = ov.fullSheet === true;
    const box = fullSheet ? null : await alphaBBox(file);
    const main = await encodeMain(file, `deco-${id}.webp`, {
      trimBox: box ?? undefined,
      invertRgb: ov.blend === 'divide',
    });
    const thumb = fullSheet
      ? await encodeSheetThumb(file, `deco-${id}.webp`, ov.blend)
      : // A miniatura mostra o arquivo ORIGINAL (nunca o invertido do modo divisão).
        await encodeThumb(file, `deco-${id}.webp`, { width: 240, height: 240, fit: 'contain', trimBox: box ?? undefined });
    out.push({
      id,
      category,
      label: ov.label ?? prettyLabel(base),
      ...(ov.blend ? { blend: ov.blend } : {}),
      ...(fullSheet ? { fullSheet: true } : {}),
      ...main,
      thumb,
    });
  }
  // Folhas inteiras (grade/sobrepor) ficam no fim da lista; demais mantêm a ordem natural.
  return out.sort((a, b) => Number(!!a.fullSheet) - Number(!!b.fullSheet));
}

async function decorations() {
  return [
    ...(await decorationGroup(SOURCES.decorations, 'enfeite')),
    ...(await decorationGroup(SOURCES.graphics, 'grafismo')),
    ...(await decorationGroup(SOURCES.window, 'janela')),
  ];
}

async function logos() {
  const dir = path.join(BRAND_ROOT, SOURCES.logo);
  const defs = [
    { file: 'papel-logo.png', id: 'paper', label: 'Com papel', resizeWidth: 2000 },
    { file: 'logo_oficial_semfundo.png', id: 'clean', label: 'Sem fundo', resizeWidth: 2160 },
  ];
  const out = [];
  for (const d of defs) {
    const file = path.join(dir, d.file);
    const box = await alphaBBox(file);
    const main = await encodeMain(file, `logo-${d.id}.webp`, { trimBox: box, resizeWidth: Math.min(d.resizeWidth, box.width) });
    const thumb = await encodeThumb(file, `logo-${d.id}.webp`, { width: 240, height: 240, fit: 'contain', trimBox: box });
    out.push({ id: d.id, label: d.label, ...main, thumb });
  }
  // Favicons a partir da logo com papel
  const paper = path.join(dir, 'papel-logo.png');
  const pbox = await alphaBBox(paper);
  for (const [name, size] of [['favicon-64.png', 64], ['apple-touch-icon.png', 180]]) {
    await sharp(paper, { limitInputPixels: false })
      .extract({ left: pbox.left, top: pbox.top, width: pbox.width, height: pbox.height })
      .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(OUT, name));
  }
  return out;
}

async function borderTexture() {
  const file = path.join(BRAND_ROOT, SOURCES.border, 'TEXTURA-BORDA.png');
  return encodeMain(file, 'textura-borda.webp');
}

/** Textura de papel amassado para o acabamento (passo 5), usada em overlay. */
async function paperTexture() {
  const file = path.join(BRAND_ROOT, SOURCES.texture, 'papel-amassado-textura.jpg');
  // 2160px (2x a largura do post, mesma regra da logo sem fundo): suficiente
  // para cobertura total e mantém o WebP abaixo do teto de 1,5 MB.
  const main = await encodeMain(file, 'papel-textura.webp', { resizeWidth: 2160 });
  const thumb = await encodeThumb(file, 'papel-textura.webp', { width: 270, height: 360, fit: 'cover' });
  return { ...main, thumb };
}

const kb = (n) => `${(n / 1024).toFixed(0).padStart(7)} KB`;

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'thumbs'), { recursive: true });

  const manifest = {
    post: { width: POST_W, height: POST_H },
    backgrounds: [
      ...(await backgrounds(SOURCES.presets, 'pronto', 'Pronto')),
      ...(await backgrounds(SOURCES.pure, 'puro', 'Puro')),
    ],
    decorations: await decorations(),
    logos: await logos(),
    borderTexture: await borderTexture(),
    paperTexture: await paperTexture(),
  };

  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  console.log('\nRelatório de otimização');
  console.log('─'.repeat(100));
  let tb = 0, ta = 0;
  for (const r of report) {
    tb += r.antes; ta += r.depois;
    console.log(`${r.saida.padEnd(26)} ${r.dim.padEnd(11)} ${kb(r.antes)} → ${kb(r.depois)}  ${r.modo}`);
  }
  console.log('─'.repeat(100));
  console.log(`${'TOTAL'.padEnd(38)} ${kb(tb)} → ${kb(ta)}  (${((1 - ta / tb) * 100).toFixed(1)}% menor)`);
  console.log(`\nManifest: ${path.relative(APP, MANIFEST)}`);
  if (failed) {
    console.error(`\n✖ Algum asset passou de ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

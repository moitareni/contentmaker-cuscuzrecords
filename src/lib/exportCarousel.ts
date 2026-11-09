import type Konva from 'konva';
import { getPostDimensions, type PostFormat } from '../brand/brand';
import { loadSlideIntoEditor, useCarousel } from '../store/carouselStore';
import type { Doc, SlideData } from '../types';
import { fireCuteConfetti } from './export';
import { ensureFontsLoaded } from './fonts';
import { ensureUserImagesReady } from './userImages';

export interface ExportCarouselOptions {
  slides: SlideData[];
  format: PostFormat;
  stage: Konva.Stage;
  stageDisplayWidth: number;
  onProgress: (current: number, total: number) => void;
}

export function formatSlideFilename(oneBasedIndex: number): string {
  const pad = String(oneBasedIndex).padStart(2, '0');
  return `slide-${pad}.png`;
}

export function generateSlideFilenames(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => formatSlideFilename(i + 1));
}

export function formatCarouselZipFilename(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  return `cuscuz-carrossel-${Y}-${M}-${D}-${h}${m}.zip`;
}

export function getCarouselExportDimensions(format: PostFormat, stageDisplayWidth: number) {
  const { width: postWidth, height: postHeight } = getPostDimensions(format);
  const pixelRatio = postWidth / stageDisplayWidth;
  const displayHeight = (stageDisplayWidth * postHeight) / postWidth;
  return {
    postWidth,
    postHeight,
    pixelRatio,
    displayHeight,
    exportedWidth: Math.round(stageDisplayWidth * pixelRatio),
    exportedHeight: Math.round(displayHeight * pixelRatio),
  };
}

export function collectDocImageIds(doc: Doc): Set<string> {
  const ids = new Set<string>();
  for (const el of doc.elements) {
    if (el.kind === 'image' && el.imageId) {
      ids.add(el.imageId);
    }
  }
  return ids;
}

export class CarouselExportError extends Error {
  slideNumber: number;
  constructor(slideNumber: number, cause?: unknown) {
    super(`Erro ao exportar slide ${slideNumber}`);
    this.name = 'CarouselExportError';
    this.slideNumber = slideNumber;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export async function exportCarousel({
  slides,
  format,
  stage,
  stageDisplayWidth,
  onProgress,
}: ExportCarouselOptions): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const { pixelRatio, displayHeight } = getCarouselExportDimensions(format, stageDisplayWidth);

  for (let i = 0; i < slides.length; i++) {
    try {
      // 1. Ativa e carrega o slide no editor (atualizando activeSlideIndex para renderizar crossovers adjacentes)
      useCarousel.setState({ activeSlideIndex: i });
      loadSlideIntoEditor(slides[i]);
      // 2. Aguarda re-render do Konva (um ciclo de RAF + margem)
      await new Promise((res) => setTimeout(res, 80));
      // 3. Garante fontes e imagens prontas (incluindo imagens de crossover dos slides adjacentes)
      await ensureFontsLoaded();
      const imageIds = collectDocImageIds(slides[i].doc);
      if (slides[i - 1]) {
        for (const id of collectDocImageIds(slides[i - 1].doc)) imageIds.add(id);
      }
      if (slides[i + 1]) {
        for (const id of collectDocImageIds(slides[i + 1].doc)) imageIds.add(id);
      }
      await ensureUserImagesReady(imageIds);
      // 4. Captura PNG
      const dataUrl = stage.toDataURL({
        pixelRatio,
        mimeType: 'image/png',
        x: stage.x(),
        y: stage.y(),
        width: stageDisplayWidth,
        height: displayHeight,
      });
      // 5. Converte para Blob e adiciona ao ZIP
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      zip.file(formatSlideFilename(i + 1), blob);
      onProgress(i + 1, slides.length);
    } catch (err) {
      throw new CarouselExportError(i + 1, err);
    }
  }

  // 6. Gera e dispara o download do ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = formatCarouselZipFilename();
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  fireCuteConfetti();
}

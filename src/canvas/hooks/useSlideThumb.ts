import React, { useEffect, useState } from 'react';
import {
  CAROUSEL_THUMB_DEBOUNCE,
  CAROUSEL_THUMB_WIDTH,
  getPostDimensions,
  type PostFormat,
} from '../../brand/brand';
import type { SlideData } from '../../types';
import type { EditorCanvasHandle } from '../EditorCanvas';

// Cache em nível de módulo (fora do React, sobrevive a re-renders)
const thumbCache = new Map<string, string>(); // slideId → dataURL
const hashCache = new Map<string, string>();  // slideId → hash do doc+finish

export interface StageLike {
  toDataURL: (config?: {
    pixelRatio?: number;
    mimeType?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => string;
  x: () => number;
  y: () => number;
}

export function computeSlideHash(
  slide: SlideData,
  prevSlide?: SlideData,
  nextSlide?: SlideData,
): string {
  return JSON.stringify({
    doc: slide.doc,
    finish: slide.finish,
    prevElements: prevSlide?.doc.elements ?? null,
    nextElements: nextSlide?.doc.elements ?? null,
  });
}

export function getThumbCaptureDimensions(displayWidth: number, format: PostFormat) {
  const { width: postW, height: postH } = getPostDimensions(format);
  const height = (displayWidth * postH) / postW;
  const pixelRatio = CAROUSEL_THUMB_WIDTH / displayWidth;
  return {
    width: displayWidth,
    height,
    pixelRatio,
    renderedWidth: displayWidth * pixelRatio,
    renderedHeight: height * pixelRatio,
  };
}

export function captureOrGetCachedThumb(
  stage: StageLike,
  displayWidth: number,
  slide: SlideData,
  format: PostFormat,
  prevSlide?: SlideData,
  nextSlide?: SlideData,
): string {
  const hash = computeSlideHash(slide, prevSlide, nextSlide);
  if (hashCache.get(slide.id) === hash && thumbCache.has(slide.id)) {
    return thumbCache.get(slide.id)!;
  }

  const { width, height, pixelRatio } = getThumbCaptureDimensions(displayWidth, format);
  const dataUrl = stage.toDataURL({
    pixelRatio,
    mimeType: 'image/webp',
    x: stage.x(),
    y: stage.y(),
    width,
    height,
  });

  thumbCache.set(slide.id, dataUrl);
  hashCache.set(slide.id, hash);
  return dataUrl;
}

export function getCachedSlideThumb(slideId: string): string | null {
  return thumbCache.get(slideId) ?? null;
}

export function clearSlideThumbCache(): void {
  thumbCache.clear();
  hashCache.clear();
}

export function useSlideThumb(
  stageRef: React.RefObject<EditorCanvasHandle | null>,
  slide: SlideData,
  format: PostFormat,
  isActive: boolean,
  isVisible = true,
  prevSlide?: SlideData,
  nextSlide?: SlideData,
): string | null {
  const [thumb, setThumb] = useState<string | null>(() => thumbCache.get(slide.id) ?? null);

  useEffect(() => {
    const hash = computeSlideHash(slide, prevSlide, nextSlide);
    if (hashCache.get(slide.id) === hash && thumbCache.has(slide.id)) {
      const cached = thumbCache.get(slide.id)!;
      if (thumb !== cached) setThumb(cached);
      return;
    }

    if (!isActive || !isVisible) return;

    const timer = setTimeout(() => {
      const stage = stageRef.current?.getStage();
      const displayWidth = stageRef.current?.getDisplayWidth();
      if (!stage || !displayWidth) return;

      const dataUrl = captureOrGetCachedThumb(
        stage,
        displayWidth,
        slide,
        format,
        prevSlide,
        nextSlide,
      );
      setThumb(dataUrl);
    }, CAROUSEL_THUMB_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [
    slide.doc,
    slide.finish,
    prevSlide?.doc.elements,
    nextSlide?.doc.elements,
    isActive,
    isVisible,
    slide.id,
    stageRef,
    format,
    thumb,
  ]);

  return thumb;
}

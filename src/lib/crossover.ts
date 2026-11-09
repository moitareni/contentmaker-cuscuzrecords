import { getDecoration, getLogo } from '../assets';
import { BORDER_PAD, getPostDimensions, type PostFormat } from '../brand/brand';
import type { Doc, El, FinishState, SlideData } from '../types';

/** Largura (px no espaço do post) da Zona de Sangria lateral. */
export const CROSSOVER_ZONE = 80;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula a extensão horizontal aproximada `[minX, maxX]` de um elemento
 * no espaço de coordenadas do slide (`0..postW`), levando em conta escala e rotação.
 */
export function getElementHorizSpan(
  el: El,
  postW: number,
): { minX: number; maxX: number } | null {
  if (el.kind === 'decoration') {
    const asset = getDecoration(el.assetId);
    if (!asset) return null;
    if (
      asset.fullSheet &&
      Math.abs(el.x - postW / 2) < 2 &&
      el.scale <= 1 &&
      Math.abs(el.rotation % 180) < 1
    ) {
      return null;
    }
    const w = asset.width * el.scale;
    const h = asset.height * el.scale;
    const rad = (el.rotation * Math.PI) / 180;
    const halfW = (w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad))) / 2;
    return { minX: el.x - halfW, maxX: el.x + halfW };
  }
  if (el.kind === 'logo') {
    const asset = getLogo(el.variant);
    if (!asset) return null;
    const w = asset.width * el.scale;
    const h = asset.height * el.scale;
    const rad = (el.rotation * Math.PI) / 180;
    const halfW = (w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad))) / 2;
    return { minX: el.x - halfW, maxX: el.x + halfW };
  }
  if (el.kind === 'image') {
    const w = el.width * el.scale;
    const h = el.height * el.scale;
    const rad = (el.rotation * Math.PI) / 180;
    const halfW = (w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad))) / 2;
    return { minX: el.x - halfW, maxX: el.x + halfW };
  }
  if (el.kind === 'text') {
    const displayText = el.uppercase ? el.text.toUpperCase() : el.text;
    const lines = (displayText || ' ').split('\n');
    const maxChars = Math.max(1, ...lines.map((l) => l.length));
    const padX = el.border !== 'none' ? el.fontSize * BORDER_PAD.x : 0;
    const padY = el.border !== 'none' ? el.fontSize * BORDER_PAD.y : 0;
    const w = Math.max(el.fontSize * 1.5, maxChars * (el.fontSize * 0.62 + el.letterSpacing)) + padX * 2;
    const h = Math.max(1, lines.length) * el.fontSize * el.lineHeight + padY * 2;
    const rad = (el.rotation * Math.PI) / 180;
    const halfW = (w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad))) / 2;
    return { minX: el.x - halfW, maxX: el.x + halfW };
  }
  return null;
}

/**
 * Verifica se um elemento atravessa ou está na Zona de Sangria da borda lateral informada
 * (`side === 'right'` → sangra para o slide `i + 1` com `x - postW`;
 *  `side === 'left'`  → sangra para o slide `i - 1` com `x + postW`).
 *
 * A condição para `'right'` sob a translação `x' = x - postW` é matematicamente simétrica
 * à condição para `'left'`, garantindo consistência bidirecional entre slides vizinhos.
 */
export function canElementBleedToSide(
  el: El,
  side: 'left' | 'right',
  postW: number,
): boolean {
  const span = getElementHorizSpan(el, postW);
  if (!span) return false;

  if (side === 'right') {
    if (el.crossover) {
      return (
        (span.minX < postW && span.maxX > postW) ||
        (span.maxX > postW - CROSSOVER_ZONE &&
          span.minX < postW + CROSSOVER_ZONE &&
          el.x > postW / 2 &&
          el.x < postW * 1.5)
      );
    }
    return span.minX < postW && span.maxX > postW && el.x > postW * 0.65;
  } else {
    if (el.crossover) {
      return (
        (span.minX < 0 && span.maxX > 0) ||
        (span.maxX > -CROSSOVER_ZONE &&
          span.minX < CROSSOVER_ZONE &&
          el.x > -postW / 2 &&
          el.x < postW / 2)
      );
    }
    return span.minX < 0 && span.maxX > 0 && el.x < postW * 0.35;
  }
}

/** Remove a flag `crossover` de uma lista de elementos (preservando referências se inalterado). */
export function stripCrossoverFromElements(elements: El[]): El[] {
  if (!elements.some((e) => e.crossover !== undefined)) return elements;
  return elements.map((e) => {
    if (e.crossover === undefined) return e;
    const copy: El = { ...e };
    delete copy.crossover;
    return copy;
  });
}

/** Remove `crossover` de todos os elementos de um slide. */
export function stripCrossoverFromSlide(slide: SlideData): SlideData {
  const cleaned = stripCrossoverFromElements(slide.doc.elements);
  if (cleaned === slide.doc.elements) return slide;
  return {
    ...slide,
    doc: {
      ...slide.doc,
      elements: cleaned,
    },
  };
}

function elementsEqual(a: El, b: El): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function upsertElementInSlide(slide: SlideData, incoming: El): SlideData {
  const list = slide.doc.elements;
  const idx = list.findIndex((e) => e.id === incoming.id);
  if (idx >= 0) {
    if (elementsEqual(list[idx], incoming)) return slide;
    const nextElements = [...list];
    nextElements[idx] = incoming;
    return {
      ...slide,
      doc: { ...slide.doc, elements: nextElements },
    };
  }
  // Se for logo e o slide já tiver outra logo diferente, substitui para manter no máx. 1 logo
  if (incoming.kind === 'logo') {
    const existingLogoIdx = list.findIndex((e) => e.kind === 'logo');
    if (existingLogoIdx >= 0) {
      const nextElements = [...list];
      nextElements[existingLogoIdx] = incoming;
      return {
        ...slide,
        doc: { ...slide.doc, elements: nextElements },
      };
    }
  }
  return {
    ...slide,
    doc: {
      ...slide.doc,
      elements: [...list, incoming],
    },
  };
}

function removeElementFromSlide(slide: SlideData, id: string): SlideData {
  if (!slide.doc.elements.some((e) => e.id === id)) return slide;
  return {
    ...slide,
    doc: {
      ...slide.doc,
      elements: slide.doc.elements.filter((e) => e.id !== id),
    },
  };
}

/**
 * Sincroniza bidirecionalmente os elementos crossover a partir de uma edição no slide ativo `activeIndex`.
 * - Se um elemento foi excluído no slide ativo, remove-o também dos slides vizinhos que o compartilhavam.
 * - Se um elemento no slide ativo sangra para a esquerda (`activeIndex - 1`) ou para a direita (`activeIndex + 1`),
 *   cria/atualiza o elemento correspondente no slide vizinho (com o mesmo `id` e `x` deslocado em `±postW`).
 * - Se um elemento que era compartilhado com um slide vizinho foi movido para longe da borda,
 *   remove-o do slide vizinho e limpa `crossover` no slide ativo.
 */
export function syncCrossoverFromActiveSlide(
  slides: SlideData[],
  activeIndex: number,
  prevActiveDoc: Doc,
  newActiveDoc: Doc,
  newActiveFinish: FinishState,
  format: PostFormat,
): SlideData[] {
  const activeSlide = slides[activeIndex];
  if (!activeSlide) return slides;

  if (slides.length <= 1) {
    const cleanedElements = stripCrossoverFromElements(newActiveDoc.elements);
    const finalDoc =
      cleanedElements === newActiveDoc.elements
        ? newActiveDoc
        : { ...newActiveDoc, elements: cleanedElements };
    if (activeSlide.doc === finalDoc && activeSlide.finish === newActiveFinish) {
      return slides;
    }
    return [{ ...activeSlide, doc: finalDoc, finish: newActiveFinish }];
  }

  const { width: postW } = getPostDimensions(format);
  const nextSlides = [...slides];

  // 1. Propagar exclusões feitas no slide ativo para quaisquer slides vizinhos que tinham o mesmo id
  const currentIds = new Set(newActiveDoc.elements.map((e) => e.id));
  const deletedIds = prevActiveDoc.elements
    .filter((e) => !currentIds.has(e.id))
    .map((e) => e.id);

  if (deletedIds.length > 0) {
    for (let j = 0; j < nextSlides.length; j++) {
      if (j === activeIndex) continue;
      for (const delId of deletedIds) {
        nextSlides[j] = removeElementFromSlide(nextSlides[j], delId);
      }
    }
  }

  // 2. Sincronizar cada elemento do slide ativo com os vizinhos imediato esquerdo (i - 1) e direito (i + 1)
  let updatedActiveElements: El[] | null = null;

  newActiveDoc.elements.forEach((el, idx) => {
    const hasPrev = activeIndex > 0;
    const hasNext = activeIndex < nextSlides.length - 1;

    const bleedsLeft = hasPrev && canElementBleedToSide(el, 'left', postW);
    const bleedsRight = hasNext && canElementBleedToSide(el, 'right', postW);

    const wasInPrev =
      hasPrev && slides[activeIndex - 1].doc.elements.some((e) => e.id === el.id);
    const wasInNext =
      hasNext && slides[activeIndex + 1].doc.elements.some((e) => e.id === el.id);

    // Atualiza slide anterior (activeIndex - 1)
    if (hasPrev) {
      if (bleedsLeft) {
        const leftCopy: El = {
          ...el,
          x: round2(el.x + postW),
          crossover: true,
        };
        nextSlides[activeIndex - 1] = upsertElementInSlide(
          nextSlides[activeIndex - 1],
          leftCopy,
        );
      } else if (wasInPrev) {
        nextSlides[activeIndex - 1] = removeElementFromSlide(
          nextSlides[activeIndex - 1],
          el.id,
        );
      }
    }

    // Atualiza slide seguinte (activeIndex + 1)
    if (hasNext) {
      if (bleedsRight) {
        const rightCopy: El = {
          ...el,
          x: round2(el.x - postW),
          crossover: true,
        };
        nextSlides[activeIndex + 1] = upsertElementInSlide(
          nextSlides[activeIndex + 1],
          rightCopy,
        );
      } else if (wasInNext) {
        nextSlides[activeIndex + 1] = removeElementFromSlide(
          nextSlides[activeIndex + 1],
          el.id,
        );
      }
    }

    // Normaliza flag crossover no próprio slide ativo
    if (bleedsLeft || bleedsRight) {
      if (el.crossover !== true) {
        if (!updatedActiveElements) updatedActiveElements = [...newActiveDoc.elements];
        updatedActiveElements[idx] = { ...el, crossover: true };
      }
    } else if (wasInPrev || wasInNext || el.crossover === false) {
      if (el.crossover !== undefined) {
        if (!updatedActiveElements) updatedActiveElements = [...newActiveDoc.elements];
        const cleaned: El = { ...el };
        delete cleaned.crossover;
        updatedActiveElements[idx] = cleaned;
      }
    }
  });

  const finalActiveDoc = updatedActiveElements
    ? { ...newActiveDoc, elements: updatedActiveElements }
    : newActiveDoc;

  if (
    activeSlide.doc !== finalActiveDoc ||
    activeSlide.finish !== newActiveFinish
  ) {
    nextSlides[activeIndex] = {
      ...activeSlide,
      doc: finalActiveDoc,
      finish: newActiveFinish,
    };
  }

  // Se nenhum slide mudou por referência, devolve o array original
  const changed = nextSlides.some((sl, i) => sl !== slides[i]);
  return changed ? nextSlides : slides;
}

/**
 * Reconcilia todos os slides do carrossel garantindo que elementos crossover em qualquer
 * slide `i` estejam materializados e sincronizados nos slides adjacentes `i - 1` e `i + 1`.
 */
export function reconcileAllCrossovers(
  slides: SlideData[],
  format: PostFormat,
): SlideData[] {
  if (slides.length === 0) return slides;
  if (slides.length === 1) {
    const cleaned = stripCrossoverFromSlide(slides[0]);
    return cleaned === slides[0] ? slides : [cleaned];
  }

  const { width: postW } = getPostDimensions(format);
  const nextSlides = [...slides];

  for (let i = 0; i < nextSlides.length; i++) {
    const slide = nextSlides[i];
    for (const el of slide.doc.elements) {
      if (i > 0 && canElementBleedToSide(el, 'left', postW)) {
        const leftCopy: El = {
          ...el,
          x: round2(el.x + postW),
          crossover: true,
        };
        nextSlides[i - 1] = upsertElementInSlide(nextSlides[i - 1], leftCopy);
      }
      if (i < nextSlides.length - 1 && canElementBleedToSide(el, 'right', postW)) {
        const rightCopy: El = {
          ...el,
          x: round2(el.x - postW),
          crossover: true,
        };
        nextSlides[i + 1] = upsertElementInSlide(nextSlides[i + 1], rightCopy);
      }
    }
  }

  const changed = nextSlides.some((sl, i) => sl !== slides[i]);
  return changed ? nextSlides : slides;
}

/**
 * Prepara o `SlideData` escolhido ao converter do Modo Carrossel para o Modo Post Único:
 * garante que quaisquer elementos crossover que atravessem a partir dos slides adjacentes
 * (`index - 1` ou `index + 1`) estejam materializados no `doc.elements` do slide escolhido
 * (em suas coordenadas locais `x ± postW`) e remove a propriedade `crossover`.
 */
export function extractSingleSlideData(
  slides: SlideData[],
  index: number,
  format: PostFormat,
): SlideData | null {
  if (slides.length === 0) return null;
  const reconciled = reconcileAllCrossovers(slides, format);
  const chosen = reconciled[index] ?? reconciled[0];
  if (!chosen) return null;
  return stripCrossoverFromSlide(chosen);
}

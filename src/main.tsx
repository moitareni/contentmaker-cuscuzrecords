import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { collectAllImageIds, reconcileAllSlides } from './lib/carouselGC';
import { setSuppressSingleDraftWrite } from './lib/storage';
import { collectGarbageImages, hydrateUserImages } from './lib/userImages';
import {
  CAROUSEL_STORAGE_KEY,
  SINGLE_STORAGE_KEY,
  loadSlideIntoEditor,
  useCarousel,
} from './store/carouselStore';
import { useEditor } from './store/editorStore';
import './theme/global.css';

// Se não há rascunho de carrossel ativo, mas existe rascunho de post único salvo no localStorage,
// restaura diretamente o Modo Post Único (Requisito 1.11).
const hasSingleDraftOnBoot =
  typeof window !== 'undefined' &&
  localStorage.getItem(SINGLE_STORAGE_KEY) !== null &&
  localStorage.getItem(CAROUSEL_STORAGE_KEY) === null;

if (hasSingleDraftOnBoot && useCarousel.getState().mode === null) {
  useCarousel.getState().setMode('single');
}

// Enquanto mode === 'carousel', bloqueia escrita em cuscuz-insta-kit:rascunho (Requisito 9.2).
setSuppressSingleDraftWrite(useCarousel.getState().mode === 'carousel');

// Subscriber de sincronização: grava alterações do Slide Ativo de volta no useCarousel.
useEditor.subscribe((s, prev) => {
  const carousel = useCarousel.getState();
  if (carousel.mode !== 'carousel') return;
  if (s.doc === prev.doc && s.finish === prev.finish) return;
  carousel.updateActiveSlide(s.doc, s.finish);
});

async function bootstrap() {
  const availableIds = await hydrateUserImages();
  const carouselState = useCarousel.getState();

  if (carouselState.mode === 'carousel') {
    const reconciled = reconcileAllSlides(carouselState.slides, availableIds);
    useCarousel.setState({ slides: reconciled });
    const active = reconciled[carouselState.activeSlideIndex] ?? reconciled[0];
    if (active) {
      loadSlideIntoEditor(active);
    }
    const allImageIds = collectAllImageIds(reconciled);
    await collectGarbageImages(allImageIds);
    useEditor.temporal.getState().clear();
  } else if (carouselState.mode === 'single') {
    const st = useEditor.getState();
    const bootImageIds = new Set(
      st.doc.elements.filter((e) => e.kind === 'image').map((e) => e.imageId),
    );
    st.reconcileImages(new Set([...bootImageIds].filter((id) => availableIds.has(id))));
    const keep = new Set<string>();
    for (const e of useEditor.getState().doc.elements) {
      if (e.kind !== 'image') continue;
      keep.add(e.imageId);
      if (e.cutFrom) keep.add(e.cutFrom.imageId);
    }
    await collectGarbageImages(keep);
    useEditor.temporal.getState().clear();
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

void bootstrap();

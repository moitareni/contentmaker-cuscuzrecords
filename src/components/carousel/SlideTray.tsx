import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import { CAROUSEL_MAX_SLIDES } from '../../brand/brand';
import type { EditorCanvasHandle } from '../../canvas/EditorCanvas';
import { isSlideEmpty, useCarousel } from '../../store/carouselStore';
import { useEditor } from '../../store/editorStore';
import { ConfirmDialog } from '../ConfirmDialog';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SlideThumb } from './SlideThumb';
import styles from './SlideTray.module.css';

export interface SlideTrayProps {
  stageRef: React.RefObject<EditorCanvasHandle | null>;
}

export const SlideTray: React.FC<SlideTrayProps> = ({ stageRef }) => {
  const slides = useCarousel((s) => s.slides);
  const activeSlideIndex = useCarousel((s) => s.activeSlideIndex);
  const format = useCarousel((s) => s.format);
  const addSlide = useCarousel((s) => s.addSlide);
  const duplicateSlide = useCarousel((s) => s.duplicateSlide);
  const removeSlide = useCarousel((s) => s.removeSlide);
  const reorderSlides = useCarousel((s) => s.reorderSlides);
  const setActiveSlide = useCarousel((s) => s.setActiveSlide);
  const showToast = useEditor((s) => s.showToast);

  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);

  const atMaxSlides = slides.length >= CAROUSEL_MAX_SLIDES;
  const atMinSlides = slides.length <= 1;
  const hasPrev = activeSlideIndex > 0;
  const hasNext = activeSlideIndex < slides.length - 1;

  const handleAddSlide = () => {
    if (atMaxSlides) {
      showToast('info', 'Chegou no limite! Um carrossel pode ter até 10 slides 🎠');
      return;
    }
    const willHitMax = slides.length + 1 >= CAROUSEL_MAX_SLIDES;
    addSlide();
    if (willHitMax) {
      showToast('info', 'Chegou no limite! Um carrossel pode ter até 10 slides 🎠');
    }
  };

  const handleDuplicateSlide = () => {
    if (atMaxSlides) {
      showToast('info', 'Chegou no limite! Um carrossel pode ter até 10 slides 🎠');
      return;
    }
    const willHitMax = slides.length + 1 >= CAROUSEL_MAX_SLIDES;
    duplicateSlide(activeSlideIndex);
    if (willHitMax) {
      showToast('info', 'Chegou no limite! Um carrossel pode ter até 10 slides 🎠');
    }
  };

  const handleRequestRemove = (index: number) => {
    if (slides.length <= 1) {
      showToast('info', 'O carrossel precisa ter pelo menos 1 slide 😅');
      return;
    }
    const target = slides[index];
    if (!target) return;
    if (isSlideEmpty(target)) {
      removeSlide(index);
    } else {
      setPendingRemoveIndex(index);
    }
  };

  const handleConfirmRemove = () => {
    if (pendingRemoveIndex !== null) {
      removeSlide(pendingRemoveIndex);
      setPendingRemoveIndex(null);
    }
  };

  return (
    <>
      <nav aria-label="Tira de slides do carrossel" className={styles.tray}>
        <div className={styles.stripRow}>
          <IconButton
            icon={<ChevronLeft size={18} strokeWidth={2.5} />}
            label="Slide anterior"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setActiveSlide(activeSlideIndex - 1)}
          />

          <div className={styles.thumbList}>
            {slides.map((slide, index) => (
              <SlideThumb
                key={slide.id}
                slide={slide}
                prevSlide={slides[index - 1]}
                nextSlide={slides[index + 1]}
                index={index}
                totalSlides={slides.length}
                format={format}
                isActive={index === activeSlideIndex}
                stageRef={stageRef}
                onSelect={setActiveSlide}
                onRequestRemove={handleRequestRemove}
                onReorder={reorderSlides}
              />
            ))}

            <button
              type="button"
              className={styles.addThumbBtn}
              aria-label="Novo slide vazio"
              title={
                atMaxSlides
                  ? 'Chegou no limite de 10 slides'
                  : 'Adicionar novo slide vazio'
              }
              disabled={atMaxSlides}
              onClick={handleAddSlide}
            >
              <Plus size={20} strokeWidth={2.75} />
            </button>
          </div>

          <IconButton
            icon={<ChevronRight size={18} strokeWidth={2.5} />}
            label="Próximo slide"
            size="sm"
            disabled={!hasNext}
            onClick={() => setActiveSlide(activeSlideIndex + 1)}
          />
        </div>

        <div className={styles.controlsRow}>
          <span className={styles.counter}>
            Slide {activeSlideIndex + 1} de {slides.length}
          </span>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} strokeWidth={2.5} />}
              disabled={atMaxSlides}
              onClick={handleAddSlide}
            >
              Novo slide vazio
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<Copy size={14} strokeWidth={2.5} />}
              disabled={atMaxSlides}
              onClick={handleDuplicateSlide}
            >
              Duplicar slide atual
            </Button>

            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={14} strokeWidth={2.5} />}
              disabled={atMinSlides}
              onClick={() => handleRequestRemove(activeSlideIndex)}
            >
              Remover slide
            </Button>
          </div>
        </div>
      </nav>

      <ConfirmDialog
        isOpen={pendingRemoveIndex !== null}
        title="Apagar este slide?"
        message="Apagar este slide? O conteúdo vai embora 🗑️"
        confirmLabel="Sim, apagar"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmRemove}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </>
  );
};

export default SlideTray;

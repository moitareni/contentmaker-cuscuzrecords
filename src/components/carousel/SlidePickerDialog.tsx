import React, { useState } from 'react';
import { getCachedSlideThumb } from '../../canvas/hooks/useSlideThumb';
import { extractSingleSlideData } from '../../lib/crossover';
import {
  CAROUSEL_STORAGE_KEY,
  useCarousel,
} from '../../store/carouselStore';
import { useEditor } from '../../store/editorStore';
import { Button } from '../ui/Button';
import styles from './SlidePickerDialog.module.css';

export interface SlidePickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SelectionOption = number | 'scratch';

export const SlidePickerDialog: React.FC<SlidePickerDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const slides = useCarousel((s) => s.slides);
  const activeSlideIndex = useCarousel((s) => s.activeSlideIndex);
  const format = useCarousel((s) => s.format);
  const resetCarousel = useCarousel((s) => s.resetCarousel);
  const setMode = useCarousel((s) => s.setMode);

  const [selected, setSelected] = useState<SelectionOption>(activeSlideIndex);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selected === 'scratch') {
      resetCarousel();
      setMode('single');
      localStorage.removeItem(CAROUSEL_STORAGE_KEY);
      useEditor.getState().reset();
      useEditor.temporal.getState().clear();
    } else {
      const chosen = extractSingleSlideData(slides, selected, format);
      resetCarousel();
      setMode('single');
      localStorage.removeItem(CAROUSEL_STORAGE_KEY);
      if (chosen) {
        useEditor.setState({
          doc: chosen.doc,
          finish: chosen.finish,
          step: 0,
          selectedIds: [],
          selectedId: null,
          editingId: null,
        });
        useEditor.temporal.getState().clear();
      }
    }
    onClose();
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Escolher slide para Post Único"
      >
        <h3 className={styles.title}>Qual slide você quer manter? 🌽</h3>
        <p className={styles.message}>
          Escolha um slide do carrossel para continuar como post único ou comece do zero.
        </p>

        <div className={styles.slideList}>
          {slides.map((slide, idx) => {
            const thumb = getCachedSlideThumb(slide.id);
            const isChosen = selected === idx;
            return (
              <button
                key={slide.id}
                type="button"
                className={`${styles.slideOption} ${isChosen ? styles.selected : ''}`}
                onClick={() => setSelected(idx)}
              >
                <div className={styles.thumbBox}>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={`Miniatura do slide ${idx + 1}`}
                      className={styles.thumbImg}
                    />
                  ) : (
                    <span className={styles.thumbPlaceholder}>#{idx + 1}</span>
                  )}
                </div>
                <span className={styles.slideLabel}>Slide {idx + 1}</span>
              </button>
            );
          })}

          <button
            type="button"
            className={`${styles.slideOption} ${styles.scratchOption} ${
              selected === 'scratch' ? styles.selected : ''
            }`}
            onClick={() => setSelected('scratch')}
          >
            <div className={styles.thumbBox}>
              <span className={styles.thumbPlaceholder}>✨</span>
            </div>
            <span className={styles.slideLabel}>Começar do zero</span>
          </button>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleConfirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
};

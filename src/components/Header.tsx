import React, { useState } from 'react';
import { Download, Images, Redo2, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import { switchSingleToCarousel, useCarousel } from '../store/carouselStore';
import { redo, undo, useEditor } from '../store/editorStore';
import { ConfirmDialog } from './ConfirmDialog';
import { SlidePickerDialog } from './carousel/SlidePickerDialog';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import styles from './Header.module.css';

export interface HeaderProps {
  onExportCarousel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onExportCarousel }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSlidePicker, setShowSlidePicker] = useState(false);

  const reset = useEditor((s) => s.reset);
  const showToast = useEditor((s) => s.showToast);

  const mode = useCarousel((s) => s.mode);
  const format = useCarousel((s) => s.format);
  const isExporting = useCarousel((s) => s.isExporting);
  const exportProgress = useCarousel((s) => s.exportProgress);

  const handleConfirmReset = () => {
    reset();
    if (mode === 'carousel') {
      useEditor.getState().setFormat(format);
    }
    setShowConfirm(false);
    showToast('info', 'Tudo limpinho para um novo post ✨');
  };

  const handleSwitchMode = () => {
    if (mode === 'single') {
      switchSingleToCarousel();
      showToast('info', 'Modo Carrossel ativado! 🎠');
    } else if (mode === 'carousel') {
      setShowSlidePicker(true);
    }
  };

  const exportLabel =
    isExporting && exportProgress
      ? `Exportando slide ${exportProgress.current} de ${exportProgress.total}...`
      : 'Exportar carrossel';

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img
            src="/brand/favicon-64.png"
            alt="Logo Cuscuz Records"
            className={styles.logo}
          />
          <div>
            <h1 className={styles.title}>Cuscuz Records</h1>
            <span className={styles.subtitle}>
              {mode === 'carousel' ? `Carrossel ${format}` : 'Insta Kit 3:4'}
            </span>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.historyGroup}>
            <IconButton
              icon={<Undo2 size={18} strokeWidth={2.5} />}
              label="Desfazer (Ctrl+Z)"
              size="sm"
              onClick={() => undo()}
            />
            <IconButton
              icon={<Redo2 size={18} strokeWidth={2.5} />}
              label="Refazer (Ctrl+Shift+Z)"
              size="sm"
              onClick={() => redo()}
            />
          </div>

          {mode === 'single' && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Images size={15} strokeWidth={2.5} />}
              onClick={handleSwitchMode}
            >
              Carrossel
            </Button>
          )}

          {mode === 'carousel' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<Sparkles size={15} strokeWidth={2.5} />}
                onClick={handleSwitchMode}
              >
                Post único
              </Button>

              <Button
                variant="primary"
                size="sm"
                icon={<Download size={15} strokeWidth={2.5} />}
                disabled={isExporting}
                onClick={onExportCarousel}
              >
                {exportLabel}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={15} strokeWidth={2.5} />}
            onClick={() => setShowConfirm(true)}
          >
            Começar do zero
          </Button>
        </div>
      </header>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Começar do zero?"
        message="Isso vai limpar o post atual e remover todos os elementos da folha. Deseja continuar?"
        onConfirm={handleConfirmReset}
        onCancel={() => setShowConfirm(false)}
      />

      <SlidePickerDialog
        isOpen={showSlidePicker}
        onClose={() => setShowSlidePicker(false)}
      />
    </>
  );
};

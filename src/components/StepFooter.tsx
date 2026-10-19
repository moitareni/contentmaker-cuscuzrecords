import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEditor } from '../store/editorStore';
import { LAST_STEP, type StepId } from '../types';
import { Button } from './ui/Button';
import styles from './StepFooter.module.css';

export const StepFooter: React.FC = () => {
  const step = useEditor((s) => s.step);
  const setStep = useEditor((s) => s.setStep);
  const hasBackground = useEditor((s) => Boolean(s.doc.backgroundId));
  const decorationsCount = useEditor((s) => s.doc.elements.filter((e) => e.kind === 'decoration').length);
  const imagesCount = useEditor((s) => s.doc.elements.filter((e) => e.kind === 'image').length);

  const handlePrev = () => {
    if (step > 0) setStep((step - 1) as StepId);
  };

  const handleNext = () => {
    if (step < LAST_STEP) setStep((step + 1) as StepId);
  };

  // Etapas opcionais com folha vazia indicam o pulo
  const nextLabel =
    step === 1 && decorationsCount === 0
      ? 'Pular (sem enfeites)'
      : step === 2 && imagesCount === 0
        ? 'Pular (sem imagem)'
        : 'Próximo';

  return (
    <footer className={styles.footer}>
      {step > 0 ? (
        <Button
          variant="secondary"
          size="md"
          icon={<ArrowLeft size={18} strokeWidth={2.5} />}
          onClick={handlePrev}
        >
          Voltar
        </Button>
      ) : (
        <div />
      )}

      {step < LAST_STEP ? (
        <Button
          variant="primary"
          size="md"
          disabled={step === 0 && !hasBackground}
          onClick={handleNext}
        >
          <span>{nextLabel}</span>
          <ArrowRight size={18} strokeWidth={2.5} />
        </Button>
      ) : (
        // Na última etapa o download vive no dock lateral (botão único)
        <div />
      )}
    </footer>
  );
};

import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEditor } from '../store/editorStore';
import { Button } from './ui/Button';
import styles from './StepFooter.module.css';

export const StepFooter: React.FC = () => {
  const step = useEditor((s) => s.step);
  const setStep = useEditor((s) => s.setStep);
  const hasBackground = useEditor((s) => Boolean(s.doc.backgroundId));
  const decorationsCount = useEditor((s) => s.doc.elements.filter((e) => e.kind === 'decoration').length);

  const handlePrev = () => {
    if (step > 0) setStep((step - 1) as 0 | 1 | 2 | 3 | 4);
  };

  const handleNext = () => {
    if (step < 4) setStep((step + 1) as 0 | 1 | 2 | 3 | 4);
  };

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

      {step < 4 ? (
        <Button
          variant="primary"
          size="md"
          disabled={step === 0 && !hasBackground}
          onClick={handleNext}
        >
          <span>
            {step === 1 && decorationsCount === 0
              ? 'Pular (sem enfeites)'
              : 'Próximo'}
          </span>
          <ArrowRight size={18} strokeWidth={2.5} />
        </Button>
      ) : (
        // Na última etapa o download vive no dock lateral (botão único)
        <div />
      )}
    </footer>
  );
};

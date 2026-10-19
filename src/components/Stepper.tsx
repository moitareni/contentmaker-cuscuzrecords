import React from 'react';
import { useEditor } from '../store/editorStore';
import type { StepId } from '../types';
import styles from './Stepper.module.css';

interface StepDef {
  id: StepId;
  label: string;
  tag?: string;
}

const STEPS: StepDef[] = [
  { id: 0, label: '1. Fundo' },
  { id: 1, label: '2. Enfeites', tag: 'opcional' },
  { id: 2, label: '3. Imagem', tag: 'opcional' },
  { id: 3, label: '4. Texto' },
  { id: 4, label: '5. Logo', tag: 'opcional' },
  { id: 5, label: '6. Textura', tag: 'opcional' },
];

export const Stepper: React.FC = () => {
  const currentStep = useEditor((s) => s.step);
  const setStep = useEditor((s) => s.setStep);
  const hasBackground = useEditor((s) => Boolean(s.doc.backgroundId));
  const showToast = useEditor((s) => s.showToast);

  const handleClick = (id: StepId) => {
    // Não permite avançar sem ter escolhido um fundo inicial
    if (id > 0 && !hasBackground) {
      showToast('error', 'Ops! Escolha um fundo primeiro 🌽');
      return;
    }
    setStep(id);
  };

  return (
    <nav aria-label="Etapas de criação" className={styles.stepper}>
      {STEPS.map((step) => {
        const isActive = step.id === currentStep;
        const isPast = step.id < currentStep;
        return (
          <button
            key={step.id}
            type="button"
            className={`${styles.stepButton} ${isActive ? styles.active : ''} ${isPast ? styles.past : ''}`}
            onClick={() => handleClick(step.id)}
          >
            <span className={styles.label}>{step.label}</span>
            {step.tag && <span className={styles.tag}>{step.tag}</span>}
          </button>
        );
      })}
    </nav>
  );
};

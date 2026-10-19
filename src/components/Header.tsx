import React, { useState } from 'react';
import { Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { redo, undo, useEditor } from '../store/editorStore';
import { IconButton } from './ui/IconButton';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const [showConfirm, setShowConfirm] = useState(false);
  const reset = useEditor((s) => s.reset);
  const showToast = useEditor((s) => s.showToast);

  const handleConfirmReset = () => {
    reset();
    setShowConfirm(false);
    showToast('info', 'Tudo limpinho para um novo post ✨');
  };

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
            <span className={styles.subtitle}>Insta Kit 3:4</span>
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
    </>
  );
};

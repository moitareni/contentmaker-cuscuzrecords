import React, { useEffect, useRef } from 'react';
import { BORDER_PAD } from '../brand/brand';
import { editorTextStyle } from '../lib/textEditorStyle';
import { useEditor } from '../store/editorStore';
import type { TextEl } from '../types';
import styles from './InlineTextEditor.module.css';

export interface InlineTextEditorProps {
  element: TextEl;
  /** Caixa medida do texto (px do post, com pads). Null enquanto mede. */
  boxW: number | null;
  boxH: number | null;
  scaleRatio: number; // escala entre o canvas real e o display na tela
  /** Origem da folha (px de tela). Null enquanto o palco não está pronto. */
  stageRect: { left: number; top: number } | null;
  onClose: () => void;
}

/**
 * Edição de texto in-place estilo Photoshop: overlay transparente
 * posicionado exatamente sobre o texto original, com a mesma tipografia
 * (as camadas de texto do Konva se escondem durante a edição).
 * Enter quebra linha, Escape/blur/clique fora confirma.
 */
export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  element,
  boxW,
  boxH,
  scaleRatio,
  stageRect,
  onClose,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateElement = useEditor((s) => s.updateElement);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  // Altura acompanha o conteúdo (largura vem da medida do Konva, ao vivo)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [element.text, element.fontSize, element.lineHeight, scaleRatio]);

  if (!stageRect) return null;

  const padX = element.border !== 'none' ? element.fontSize * BORDER_PAD.x : 0;
  const padY = element.border !== 'none' ? element.fontSize * BORDER_PAD.y : 0;

  // Centro do texto na tela
  const screenX = stageRect.left + element.x * scaleRatio;
  const screenY = stageRect.top + element.y * scaleRatio;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateElement(element.id, { text: e.target.value });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.editorBox}
        style={{
          left: `${screenX}px`,
          top: `${screenY}px`,
          width: boxW != null ? `${Math.max(1, boxW * scaleRatio)}px` : undefined,
          minHeight: boxH != null ? `${Math.max(1, boxH * scaleRatio)}px` : undefined,
          transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <textarea
          ref={textareaRef}
          value={element.text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={onClose}
          rows={1}
          wrap="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Editar texto"
          style={editorTextStyle(element, { scaleRatio, padX, padY })}
          className={styles.textarea}
        />
      </div>
    </div>
  );
};

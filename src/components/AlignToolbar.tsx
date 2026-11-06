import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Trash2,
} from 'lucide-react';
import { useEditor, useSelected } from '../store/editorStore';
import type { AlignMode } from '../types';
import { IconButton } from './ui/IconButton';
import styles from './AlignToolbar.module.css';

export interface AlignToolbarProps {
  onAlignToPage: (mode: AlignMode) => void;
}

export const AlignToolbar: React.FC<AlignToolbarProps> = ({ onAlignToPage }) => {
  const selected = useSelected();
  const selectedIds = useEditor((s) => s.selectedIds);
  const removeElement = useEditor((s) => s.removeElement);
  const removeElements = useEditor((s) => s.removeElements);
  const duplicateElement = useEditor((s) => s.duplicateElement);
  const duplicateElements = useEditor((s) => s.duplicateElements);
  const bringForward = useEditor((s) => s.bringForward);
  const bringForwardMany = useEditor((s) => s.bringForwardMany);
  const sendBackward = useEditor((s) => s.sendBackward);
  const sendBackwardMany = useEditor((s) => s.sendBackwardMany);
  const updateElement = useEditor((s) => s.updateElement);

  // Seleção múltipla: `selected` é null (há mais de um), mas as ações valem para o conjunto.
  const multi = selectedIds.length > 1;
  if (!selected && !multi) return null;

  // Enfeites e imagens do usuário têm espelhamento (flipX/flipY no store)
  // (Em conjunto não espelha: o flip é por elemento.)
  const flipTarget =
    selected && (selected.kind === 'decoration' || selected.kind === 'image') ? selected : null;

  return (
    <aside aria-label={multi ? 'Ações dos elementos selecionados' : 'Ações do elemento'} className={styles.toolbar}>
      {multi && (
        <div
          className={styles.count}
          aria-live="polite"
          aria-label={`${selectedIds.length} elementos selecionados`}
          title={`${selectedIds.length} selecionados · Ctrl + clique soma ou tira da seleção`}
        >
          {selectedIds.length}×
        </div>
      )}
      {multi && <div className={styles.divider} />}
      {/* Alinhamento Horizontal à Página */}
      <div className={styles.group}>
        <IconButton
          icon={<AlignStartVertical size={17} strokeWidth={2.5} />}
          label="Alinhar à esquerda da página"
          size="sm"
          onClick={() => onAlignToPage('left')}
        />
        <IconButton
          icon={<AlignCenterVertical size={17} strokeWidth={2.5} />}
          label="Centralizar horizontalmente na página"
          size="sm"
          onClick={() => onAlignToPage('centerH')}
        />
        <IconButton
          icon={<AlignEndVertical size={17} strokeWidth={2.5} />}
          label="Alinhar à direita da página"
          size="sm"
          onClick={() => onAlignToPage('right')}
        />
      </div>

      <div className={styles.divider} />

      {/* Alinhamento Vertical à Página */}
      <div className={styles.group}>
        <IconButton
          icon={<AlignStartHorizontal size={17} strokeWidth={2.5} />}
          label="Alinhar ao topo da página"
          size="sm"
          onClick={() => onAlignToPage('top')}
        />
        <IconButton
          icon={<AlignCenterHorizontal size={17} strokeWidth={2.5} />}
          label="Centralizar verticalmente na página"
          size="sm"
          onClick={() => onAlignToPage('centerV')}
        />
        <IconButton
          icon={<AlignEndHorizontal size={17} strokeWidth={2.5} />}
          label="Alinhar à base da página"
          size="sm"
          onClick={() => onAlignToPage('bottom')}
        />
      </div>

      {/* Espelhamento para Enfeites e Imagens */}
      {flipTarget && (
        <>
          <div className={styles.divider} />
          <div className={styles.group}>
            <IconButton
              icon={<FlipHorizontal size={17} strokeWidth={2.5} />}
              label="Espelhar horizontalmente"
              size="sm"
              active={flipTarget.flipX}
              onClick={() => updateElement(flipTarget.id, { flipX: !flipTarget.flipX })}
            />
            <IconButton
              icon={<FlipVertical size={17} strokeWidth={2.5} />}
              label="Espelhar verticalmente"
              size="sm"
              active={flipTarget.flipY}
              onClick={() => updateElement(flipTarget.id, { flipY: !flipTarget.flipY })}
            />
          </div>
        </>
      )}

      <div className={styles.divider} />

      {/* Camadas e Ações (grade 2x2) */}
      <div className={`${styles.group} ${styles.grid2}`}>
        <IconButton
          icon={<ArrowUpToLine size={17} strokeWidth={2.5} />}
          label="Trazer para frente"
          size="sm"
          onClick={() => (selected ? bringForward(selected.id) : bringForwardMany(selectedIds))}
        />
        <IconButton
          icon={<ArrowDownToLine size={17} strokeWidth={2.5} />}
          label="Enviar para trás"
          size="sm"
          onClick={() => (selected ? sendBackward(selected.id) : sendBackwardMany(selectedIds))}
        />
        <IconButton
          icon={<Copy size={17} strokeWidth={2.5} />}
          label="Duplicar (Ctrl+D)"
          size="sm"
          onClick={() => (selected ? duplicateElement(selected.id) : duplicateElements(selectedIds))}
        />
        <IconButton
          icon={<Trash2 size={17} strokeWidth={2.5} />}
          label="Excluir (Delete)"
          size="sm"
          variant="danger"
          onClick={() => (selected ? removeElement(selected.id) : removeElements(selectedIds))}
        />
      </div>
    </aside>
  );
};

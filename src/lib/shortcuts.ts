import { useEffect } from 'react';
import { POST_W } from '../brand/brand';
import { zoomStepIn, zoomStepOut } from './zoom';
import { redo, undo, useEditor } from '../store/editorStore';

/**
 * Hook para atalhos de teclado globais do editor:
 * - Ctrl+Z / Ctrl+Shift+Z / Cmd+Z / Cmd+Shift+Z (Desfazer / Refazer)
 * - Delete / Backspace (Excluir elemento selecionado se não estiver digitando em input)
 * - Ctrl+D / Cmd+D (Duplicar elemento selecionado)
 * - Setas direcionais (Mover 1px, ou 10px com Shift)
 * - Escape (Desmarcar seleção)
 * - G (Mostrar/esconder guias de layout)
 * - Ctrl+= / Ctrl+- / Ctrl+0 (Zoom + / Zoom − / Ajustar à tela)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se o usuário estiver digitando em um input, textarea ou contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const { selectedId, removeElement, duplicateElement, updateElement, doc, select, toggleGuidesVisible } = useEditor.getState();

      // Undo / Redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      // Escape -> Desselecionar
      if (e.key === 'Escape') {
        select(null);
        return;
      }

      // G -> Mostrar/esconder guias de layout (funciona sem seleção)
      if (!mod && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        toggleGuidesVisible();
        return;
      }

      // Zoom -> Ctrl+= amplia, Ctrl+- reduz, Ctrl+0 ajusta à tela
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const { zoom, fitWidth, setZoom } = useEditor.getState();
        setZoom(zoomStepIn((fitWidth * zoom) / POST_W) / (fitWidth / POST_W));
        return;
      }
      if (mod && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        const { zoom, fitWidth, setZoom } = useEditor.getState();
        setZoom(zoomStepOut((fitWidth * zoom) / POST_W) / (fitWidth / POST_W));
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        useEditor.getState().setZoom(1);
        return;
      }

      // Se nenhum elemento estiver selecionado, os demais atalhos não operam
      if (!selectedId) return;

      const currentEl = doc.elements.find((el) => el.id === selectedId);
      if (!currentEl) return;

      // Duplicate: Ctrl+D
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateElement(selectedId);
        return;
      }

      // Delete / Backspace: Excluir
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeElement(selectedId);
        return;
      }

      // Arrow keys: Mover
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;

        updateElement(selectedId, {
          x: currentEl.x + dx,
          y: currentEl.y + dy,
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';
import { importImageFiles } from '../../lib/imageImport';

/**
 * Arrastar e soltar imagens do usuário no canvas.
 *
 * O soltar na folha importa o arquivo e posiciona a imagem no ponto do drop
 * (convertido para px do post). A janela inteira tem guard: sem preventDefault
 * em dragover/drop o navegador abre o arquivo em outra aba.
 */
export function useFileDrop(
  containerRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<Konva.Stage | null>,
) {
  const [dragOverFiles, setDragOverFiles] = useState(false);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const guard = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    window.addEventListener('dragover', guard, { passive: false });
    window.addEventListener('drop', guard, { passive: false });
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragOverFiles(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragOverFiles(false);
    };
    const onDrop = (e: DragEvent) => {
      dragDepthRef.current = 0;
      setDragOverFiles(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      // Ponto do drop em px do post (mesma conta do zoom ancorado no cursor).
      const stage = stageRef.current;
      let at: { x: number; y: number } | undefined;
      if (stage) {
        const rect = stage.container().getBoundingClientRect();
        const scale = stage.scaleX() || 1;
        at = {
          x: (e.clientX - rect.left - stage.x()) / scale,
          y: (e.clientY - rect.top - stage.y()) / scale,
        };
      }
      void importImageFiles(files, at);
    };
    c.addEventListener('dragenter', onDragEnter);
    c.addEventListener('dragover', onDragOver);
    c.addEventListener('dragleave', onDragLeave);
    c.addEventListener('drop', onDrop);
    return () => {
      c.removeEventListener('dragenter', onDragEnter);
      c.removeEventListener('dragover', onDragOver);
      c.removeEventListener('dragleave', onDragLeave);
      c.removeEventListener('drop', onDrop);
    };
  }, [containerRef, stageRef]);

  return { dragOverFiles };
}

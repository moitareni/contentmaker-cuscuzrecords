import { useEffect } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';
import { getPostDimensions } from '../../brand/brand';
import { clampZoom } from '../../lib/zoom';
import { useEditor } from '../../store/editorStore';

/**
 * Ctrl/Cmd+roda = zoom ancorado no cursor (estilo Photoshop).
 * Roda sem Ctrl segue rolando o container normalmente — incluindo sobre o
 * overlay, que rola manualmente o container (o overlay não é o scroller).
 */
export function useZoomWheel(
  containerRef: RefObject<HTMLElement | null>,
  overlayWrapRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<Konva.Stage | null>,
  computeFitWidth: () => number,
): void {
  useEffect(() => {
    const c = containerRef.current;
    const wrap = overlayWrapRef.current;
    if (!c) return;
    const onZoomWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const st = useEditor.getState();
      const fit = computeFitWidth();
      const currentPostW = getPostDimensions(st.doc.format).width;
      const oldScale = (fit * st.zoom) / currentPostW;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const nextZoom = clampZoom(st.zoom * Math.pow(1.0015, -delta));
      if (nextZoom === st.zoom) return;

      // Ponto do post sob o cursor antes do zoom
      const stage = stageRef.current;
      const container = containerRef.current;
      let sx = 0;
      let sy = 0;
      let anchored = false;
      if (stage && container) {
        const rect = stage.container().getBoundingClientRect();
        // O contêiner do palco começa padX/padY px antes da folha
        // (CSS offset −pad); desconta para ancorar no ponto do post.
        sx = e.clientX - rect.left - stage.x();
        sy = e.clientY - rect.top - stage.y();
        anchored = true;
      }
      st.setZoom(nextZoom);
      if (!anchored) return;

      // Recompensa a rolagem para o ponto continuar sob o cursor
      requestAnimationFrame(() => {
        const cc = containerRef.current;
        if (!cc) return;
        const s = useEditor.getState();
        const nextPostW = getPostDimensions(s.doc.format).width;
        const newScale = (computeFitWidth() * s.zoom) / nextPostW;
        cc.scrollLeft += (sx / oldScale) * newScale - sx;
        cc.scrollTop += (sy / oldScale) * newScale - sy;
      });
    };
    const onPlainWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (e.deltaMode === 1) {
        c.scrollTop += e.deltaY * 16;
        c.scrollLeft += e.deltaX * 16;
      } else {
        c.scrollTop += e.deltaY;
        c.scrollLeft += e.deltaX;
      }
    };
    c.addEventListener('wheel', onZoomWheel, { passive: false });
    if (wrap) {
      wrap.addEventListener('wheel', onZoomWheel, { passive: false });
      wrap.addEventListener('wheel', onPlainWheel, { passive: false });
    }
    return () => {
      c.removeEventListener('wheel', onZoomWheel);
      if (wrap) {
        wrap.removeEventListener('wheel', onZoomWheel);
        wrap.removeEventListener('wheel', onPlainWheel);
      }
    };
  }, [computeFitWidth, containerRef, overlayWrapRef, stageRef]);
}

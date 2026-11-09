import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { getPostDimensions } from '../../brand/brand';
import { useEditor } from '../../store/editorStore';

/** Pad do palco (px de mundo) por lado; derivado em px de tela pelo zoom. */
const BASE_PAD_WORLD = 52;

/**
 * Largura de ajuste à tela (fit) mantendo a proporção do post, e os valores
 * derivados de exibição (fit × zoom) usados pelo EditorCanvas no JSX.
 *
 * O fit reserva o pad do palco (alças fora da folha) para não criar barra de
 * rolagem quando a folha está ajustada à tela: folha + 2×pad ≤ container.
 * `fitWidth` vive no store; o hook só escreve via `setFitWidth` e devolve os
 * derivados em px de tela.
 */
export function useCanvasFitWidth(containerRef: RefObject<HTMLElement | null>) {
  const fitWidth = useEditor((s) => s.fitWidth);
  const zoom = useEditor((s) => s.zoom);
  const format = useEditor((s) => s.doc.format ?? '3:4');
  const setFitWidth = useEditor((s) => s.setFitWidth);

  const computeFitWidth = useCallback(() => {
    const el = containerRef.current;
    if (!el) return 360;
    const { clientWidth, clientHeight } = el;
    if (clientWidth <= 0 || clientHeight <= 0) return 360;

    const pad = 24;
    // Folga para a parte fixa (6px de cada lado) do pad do palco.
    const slack = 14;
    // Reserva a faixa do dock lateral (mesmo valor de --dock-reserve no CSS
    // do .container) para o fit caber sem rolar por baixo do dock
    const dockReserve = 176;
    const maxW = clientWidth - pad * 2 - slack - dockReserve;
    const maxH = clientHeight - pad * 2 - slack;

    const currentDoc = useEditor.getState().doc;
    const { width: pW, height: pH } = getPostDimensions(currentDoc.format);

    const fitW = maxW / (1 + 104 / pW);
    const fitH = (maxH / (1 + 104 / pH)) * (pW / pH);

    return Math.max(200, Math.floor(Math.min(fitW, fitH)));
  }, [containerRef]);

  const updateDimensions = useCallback(() => {
    setFitWidth(computeFitWidth());
  }, [computeFitWidth, setFitWidth]);

  // Re-fit ao trocar de formato (proporção muda).
  useEffect(() => {
    updateDimensions();
  }, [format, updateDimensions]);

  // Resize: mede de novo quando o container muda de tamanho.
  useEffect(() => {
    updateDimensions();
    const ro = new ResizeObserver(() => updateDimensions());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', updateDimensions);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions, containerRef]);

  const { width: postW, height: postH } = getPostDimensions(format);
  const displayWidth = Math.max(1, Math.round(fitWidth * zoom));
  const scaleRatio = displayWidth / postW;
  const displayHeight = (displayWidth * postH) / postW;
  // Pad do palco (px de tela): valor FIXO por lado, derivado só do zoom. Não
  // depende de seleção/arrasto → o layout nunca muda durante o uso e a folha
  // fica parada. Serve de respiro para as alças próximas da borda e de área
  // de rolagem alcançável (margens do .canvasFrame, definidas no JSX).
  const padX = Math.ceil(BASE_PAD_WORLD * scaleRatio) + 6;
  const padY = padX;

  return { computeFitWidth, displayWidth, displayHeight, scaleRatio, padX, padY };
}

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';

/**
 * Watchdog da transformação.
 *
 * O `_handleMouseMove` do Konva não checa os botões do mouse: se o mouseup
 * acontece fora da página (cursor sai da janela, janela perde foco, aba é
 * trocada no meio do giro), o rotater fica "preso" e cada mousemove segue
 * girando/redimensionando o elemento sozinho. Encerramos a transformação
 * assim que qualquer sinal indica que o ponteiro não está pressionado.
 */
export function useTransformWatchdog(trRef: RefObject<Konva.Transformer | null>): void {
  useEffect(() => {
    const stop = () => {
      const tr = trRef.current;
      if (tr && tr.isTransforming()) tr.stopTransform();
    };
    const onMouseMove = (e: MouseEvent) => {
      // Durante um giro real `buttons` é 1; 0 = o botão já foi solto em
      // algum lugar que o Konva não enxerga.
      const tr = trRef.current;
      if (tr && tr.isTransforming() && e.buttons === 0) stop();
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) stop();
    };
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('mouseup', stop, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('touchmove', onTouch, true);
    window.addEventListener('touchend', onTouch, true);
    window.addEventListener('touchcancel', onTouch, true);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointerup', stop, true);
      window.removeEventListener('mouseup', stop, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('touchmove', onTouch, true);
      window.removeEventListener('touchend', onTouch, true);
      window.removeEventListener('touchcancel', onTouch, true);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [trRef]);
}

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';
import {
  MIRROR_PATCH_VERSION,
  mirrorFitNodesInto,
  mirrorGetTransform,
  transformerProto,
  type MirrorHost,
} from '../mirrorTransformer';

// Folga mínima (px de tela) além das bordas do canvas principal, para que as
// alças continuem visíveis/clicáveis com o elemento arrastado bem longe.
const OVERLAY_SLACK_MIN = 520;

export interface OverlaySize {
  w: number;
  h: number;
  slackL: number;
  slackT: number;
}

/**
 * Posicionamento e geometria do palco overlay (alças).
 *
 * O canvas do overlay nasce deslocado (folga) em relação à origem visual
 * do canvas principal, e o Transformer desenha em px crus do próprio
 * canvas. O alinhamento é 100% CSS: o wrap recebe um translate que o cola
 * na origem do canvas principal (menos a folga). A rolagem só move o wrap
 * via transform — sem redesenho e sem sincronizar transformes do Konva.
 */
export function useOverlayGeometry(
  containerRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<Konva.Stage | null>,
  overlayWrapRef: RefObject<HTMLElement | null>,
  trRef: RefObject<Konva.Transformer | null>,
  displayWidth: number,
  displayHeight: number,
  padX: number,
  padY: number,
) {
  // Geometria do overlay em px de tela: tamanho do canvas e folga (slack) de
  // cada lado além do canvas principal. Só muda com zoom/fit — nunca no meio
  // de um arrasto.
  const [overlaySize, setOverlaySize] = useState<OverlaySize>({ w: 0, h: 0, slackL: 0, slackT: 0 });

  const syncOverlayPosition = useCallback(() => {
    const wrap = overlayWrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;
    const area = wrap.parentElement;
    if (!area) return;
    const mainRect = stage.container().getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const x = mainRect.left - areaRect.left - overlaySize.slackL;
    const y = mainRect.top - areaRect.top - overlaySize.slackT;
    wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [overlaySize.slackL, overlaySize.slackT, overlayWrapRef, stageRef]);

  // Rolagem move a folha na tela: re-alinha o overlay (só transform, as
  // alças acompanham o conteúdo sem redesenho)
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onScroll = () => syncOverlayPosition();
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => c.removeEventListener('scroll', onScroll);
  }, [syncOverlayPosition, containerRef]);

  // Mede a geometria do overlay (folga + tamanho) quando zoom/fit mudam. A
  // folga cobre todo o alcance de rolagem do container (mais um respiro
  // fixo), então as alças continuam visíveis com o elemento arrastado para
  // qualquer borda — sem o canvas crescer no meio de um arrasto.
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    const measure = () => {
      const stage = stageRef.current;
      const c = containerRef.current;
      if (!stage || !c) return;
      const mainRect = stage.container().getBoundingClientRect();
      const cRect = c.getBoundingClientRect();
      // Origem do canvas principal em px de conteúdo (independe da rolagem)
      const originX = mainRect.left - cRect.left + c.scrollLeft;
      const originY = mainRect.top - cRect.top + c.scrollTop;
      const maxSx = Math.max(0, c.scrollWidth - c.clientWidth);
      const maxSy = Math.max(0, c.scrollHeight - c.clientHeight);
      const slackL = Math.max(OVERLAY_SLACK_MIN, Math.ceil(originX + maxSx));
      const slackT = Math.max(OVERLAY_SLACK_MIN, Math.ceil(originY + maxSy));
      const slackR = Math.max(
        OVERLAY_SLACK_MIN,
        Math.ceil(c.scrollWidth - (originX + displayWidth + 2 * padX))
      );
      const slackB = Math.max(
        OVERLAY_SLACK_MIN,
        Math.ceil(c.scrollHeight - (originY + displayHeight + 2 * padY))
      );
      setOverlaySize((prev) => {
        const w = displayWidth + 2 * padX + slackL + slackR;
        const h = displayHeight + 2 * padY + slackT + slackB;
        const same =
          prev.w === w && prev.h === h && prev.slackL === slackL && prev.slackT === slackT;
        return same ? prev : { w, h, slackL, slackT };
      });
    };
    measure();
    // Re-medida após o layout assentar (fontes/imagens podem mudar a rolagem)
    raf1 = requestAnimationFrame(() => {
      measure();
      raf2 = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [displayWidth, displayHeight, padX, padY, containerRef, stageRef]);

  // Aplica a folga ao Transformer espelhado (soma na coordenada local, ver
  // o patch de mirrorTransformer.ts) e realinha o overlay após cada mudança
  // de geometria.
  // Cinto e suspensório do HMR: reaplica o patch na própria instância —
  // uma instância órfã (montada com módulo antigo) tem os métodos no
  // protótipo antigo da subclasse, e propriedades próprias sombreiam esse
  // protótipo inalcançável.
  useEffect(() => {
    const tr = trRef.current as (MirrorHost & { _mirrorSlackX: number; _mirrorSlackY: number }) | null;
    if (!tr) return;
    const anyTr = tr as unknown as Record<string, unknown>;
    anyTr.getTransform = function (this: MirrorHost) {
      return mirrorGetTransform(this, transformerProto.__mirrorBaseGetTransform!);
    };
    anyTr._fitNodesInto = function (this: MirrorHost, newAttrs: any, evt?: any) {
      return mirrorFitNodesInto(this, newAttrs, evt, transformerProto.__mirrorBaseFit!);
    };
    anyTr.__mirrorPatchVersion = MIRROR_PATCH_VERSION;
    tr._mirrorSlackX = overlaySize.slackL;
    tr._mirrorSlackY = overlaySize.slackT;
    (tr as unknown as { _resetTransformCache?: () => void })._resetTransformCache?.();
    tr.update();
    tr.getLayer()?.batchDraw();
    syncOverlayPosition();
  }, [overlaySize, syncOverlayPosition, trRef]);

  return { overlaySize, syncOverlayPosition };
}

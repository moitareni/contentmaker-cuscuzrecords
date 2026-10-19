import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ComponentProps, ComponentType } from 'react';
import { Group, Layer, Stage, Transformer } from 'react-konva';
import Konva from 'konva';
import { COLORS, GUIDE_SNAP_THRESHOLD, POST_H, POST_W } from '../brand/brand';
import { alignDelta, snapToCenter, snapToGuides } from '../lib/align';
import { importImageFiles } from '../lib/imageImport';
import { clampZoom } from '../lib/zoom';
import { useEditor } from '../store/editorStore';
import type { AlignMode, DecorationEl, ImageEl, LogoEl, TextEl } from '../types';
import { BackgroundNode } from './BackgroundNode';
import { DecorationNode } from './DecorationNode';
import { ImageNode } from './ImageNode';
import { InlineTextEditor } from './InlineTextEditor';
import { LayoutGuides } from './LayoutGuides';
import { LogoNode } from './LogoNode';
import { SnapGuides } from './SnapGuides';
import { TextNode } from './TextNode';
import { TextureOverlays } from './TextureOverlays';
import styles from './EditorCanvas.module.css';

export interface EditorCanvasHandle {
  getStage: () => Konva.Stage | null;
  getDisplayWidth: () => number;
  alignSelected: (mode: AlignMode) => void;
}

/**
 * Alças do Transformer num **palco overlay** separado (veja o bloco JSX no
 * fim do render): um canvas irmão do palco principal, alinhado por CSS à
 * origem dele e maior (folga para as alças), que rola junto com o conteúdo.
 *
 * Por quê: o Konva Transformer desenha em "px crus" do canvas do seu palco,
 * IGNORANDO x/y/scale do Stage (ver `getAbsoluteTransform` no source do
 * Konva). Antes o palco principal crescia (pad adaptativo) para dar espaço —
 * e cada crescimento mudava as margens do `.canvasFrame`, deslizando a folha
 * a cada soltura do elemento. Com o overlay:
 *  1. O palco principal usa pads FIXOS → a folha nunca muda de posição.
 *  2. As alças seguem o elemento para qualquer posição de arrasto, enquanto
 *     o conteúdo fora da folha continua mascarado pelos limites 3:4 no
 *     palco principal.
 * O patch no `Konva.Transformer.prototype` (abaixo) soma o deslocamento
 * (slack) do overlay na coordenada local do Transformer, pois o canvas do
 * overlay nasce fora da origem visual do canvas principal. Eventos do
 * overlay que não acertam uma âncora são repostos ("bridge") no palco
 * principal para seleção/arraste/duplo clique/pan continuarem iguais.
 * Um watchdog de eventos encerra transformações "fantasma" (mouseup perdido
 * fora da página) para o giro nunca continuar sozinho.
 */
const BASE_PAD_WORLD = 52;
// Folga mínima (px de tela) além das bordas do canvas principal, para que as
// alças continuem visíveis/clicáveis com o elemento arrastado bem longe.
const OVERLAY_SLACK_MIN = 520;

/** Versão do patch do espelho no protótipo (incrementar a cada mudança de
 * lógica). O carimbo permite reaplicar de forma idempotente sob HMR. */
const MIRROR_PATCH_VERSION = 2;

type MirrorHost = Konva.Transformer & {
  _mirrorSlackX?: number;
  _mirrorSlackY?: number;
  __mirrorPatchVersion?: number;
};

/** getTransform do espelho: soma a folga à coluna de translação em CÓPIA (o
 * Transform do Konva é cacheado — nunca mutar). Isso alinha o DESENHO das
 * alças: o Konva Transformer desenha em px crus do canvas do seu palco, e o
 * canvas do overlay nasce deslocado (folga) em relação ao canvas principal. */
const mirrorGetTransform = (
  tr: MirrorHost,
  base: (this: Konva.Transformer) => Konva.Transform,
): Konva.Transform => {
  const t = base.call(tr);
  const sx = tr._mirrorSlackX || 0;
  const sy = tr._mirrorSlackY || 0;
  if (!sx && !sy) return t;
  const copy = t.copy();
  copy.m[4] += sx;
  copy.m[5] += sy;
  return copy;
};

/** _fitNodesInto do espelho: só o ramo das âncoras de resize traz newAttrs no
 * espaço deslocado (posição absoluta das âncoras, px crus + folga) — nesse
 * caso devolve ao espaço do canvas principal antes de delegar, para que o
 * delta do writeback (linhas ~785-796 do Transformer.js) não contamine a
 * posição do nó. O ROTATER é diferente: chega `shape` no espaço RETO do
 * retângulo (`_getNodeRect`, invariante ao shift — o ângulo usa apenas
 * coordenadas locais, linhas 497-512) — retirar a folga nesse caminho
 * teleportaria o elemento para longe. */
const mirrorFitNodesInto = (
  tr: MirrorHost,
  newAttrs: any,
  evt: any,
  base: (this: Konva.Transformer, newAttrs: any, evt?: any) => void,
) => {
  const sx = tr._mirrorSlackX || 0;
  const sy = tr._mirrorSlackY || 0;
  const moving = (tr as any)._movingAnchorName || '';
  let attrs = newAttrs;
  if ((sx || sy) && moving && moving !== 'rotater' && attrs && typeof attrs.x === 'number') {
    attrs = { ...attrs, x: attrs.x - sx, y: attrs.y - sy };
  }
  return base.call(tr, attrs, evt);
};

// Patch na BASE (Konva.Transformer.prototype), uma vez por sessão e
// idempotente sob HMR: os métodos originais são guardados no primeiro patch
// e re-execuções do módulo apenas religam a versão. Qualquer instância de
// Transformer — nova ou órfã de um módulo recarregado — resolve para a
// lógica vigente, sem depender de recarregar a página.
const transformerProto = Konva.Transformer.prototype as unknown as MirrorHost & {
  __mirrorBaseGetTransform?: (this: Konva.Transformer) => Konva.Transform;
  __mirrorBaseFit?: (this: Konva.Transformer, newAttrs: any, evt?: any) => void;
};
if (transformerProto.__mirrorPatchVersion !== MIRROR_PATCH_VERSION) {
  if (!transformerProto.__mirrorBaseGetTransform) {
    transformerProto.__mirrorBaseGetTransform = transformerProto.getTransform;
    transformerProto.__mirrorBaseFit = transformerProto._fitNodesInto;
  }
  transformerProto.getTransform = function (this: MirrorHost) {
    return mirrorGetTransform(this, transformerProto.__mirrorBaseGetTransform!);
  };
  transformerProto._fitNodesInto = function (this: MirrorHost, newAttrs: any, evt?: any) {
    return mirrorFitNodesInto(this, newAttrs, evt, transformerProto.__mirrorBaseFit!);
  };
  transformerProto.__mirrorPatchVersion = MIRROR_PATCH_VERSION;
}

// react-konva instancia hosts via `new Konva[type]` — registra a subclasse
// para poder usá-la como <MirrorTransformerEl /> no JSX. A subclasse fica
// VAZIA: o comportamento vive no patch da base acima.
(Konva as unknown as Record<string, unknown>).MirrorTransformer =
  class MirrorTransformer extends Konva.Transformer {};
// Tag "host" do react-konva para a subclasse registrada acima — tipagem
// reaproveita as props do Transformer padrão para o JSX checar tudo.
const MirrorTransformerEl = 'MirrorTransformer' as unknown as ComponentType<
  ComponentProps<typeof Transformer>
>;

export const EditorCanvas = forwardRef<EditorCanvasHandle>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  // Palco overlay (alças): wrap posicionado por CSS + stage em identidade
  const overlayStageRef = useRef<Konva.Stage>(null);
  const overlayWrapRef = useRef<HTMLDivElement>(null);
  // Ponte ativa = ponteiro "pressionado" repassado ao palco principal
  const bridgeActiveRef = useRef(false);
  // Snap do proxy-drag sempre via a closure mais recente do componente
  const handleDragMoveSnapRef = useRef<(node: Konva.Node) => void>(() => {});
  // Geometria do overlay em px de tela: tamanho do canvas e folga (slack) de
  // cada lado além do canvas principal. Só muda com zoom/fit — nunca no meio
  // de um arrasto.
  const [overlaySize, setOverlaySize] = useState({ w: 0, h: 0, slackL: 0, slackT: 0 });

  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const editingId = useEditor((s) => s.editingId);
  const guides = useEditor((s) => s.guides);
  const layoutGuides = useEditor((s) => s.layoutGuides);
  const finish = useEditor((s) => s.finish);
  const zoom = useEditor((s) => s.zoom);
  const fitWidth = useEditor((s) => s.fitWidth);
  const setFitWidth = useEditor((s) => s.setFitWidth);

  const select = useEditor((s) => s.select);
  const setEditing = useEditor((s) => s.setEditing);
  const setGuides = useEditor((s) => s.setGuides);
  const updateElement = useEditor((s) => s.updateElement);
  const setTextSize = useEditor((s) => s.setTextSize);

  // Largura de ajuste à tela (fit) mantendo a proporção 3:4.
  // A exibição real é fit × zoom; tudo abaixo deriva dela.
  // O fit reserva o pad do palco (alças fora da folha) para não criar barra de
  // rolagem quando a folha está ajustada à tela: folha + 2×pad ≤ container.
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

    // Proporção 3:4 com o pad do palco entra na conta:
    //   horizontal: fit × (1 + 104/POST_W) ≤ maxW
    //   vertical:   fit × (POST_H/POST_W) × (1 + 104/POST_H) ≤ maxH
    const fitW = maxW / (1 + 104 / POST_W);
    const fitH = (maxH / (1 + 104 / POST_H)) * (POST_W / POST_H);

    return Math.max(200, Math.floor(Math.min(fitW, fitH)));
  }, []);

  const updateDimensions = useCallback(() => {
    setFitWidth(computeFitWidth());
  }, [computeFitWidth, setFitWidth]);

  useEffect(() => {
    updateDimensions();
    const ro = new ResizeObserver(() => updateDimensions());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', updateDimensions);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [updateDimensions]);

  const displayWidth = Math.max(1, Math.round(fitWidth * zoom));
  const scaleRatio = displayWidth / POST_W;
  const displayHeight = (displayWidth * POST_H) / POST_W;
  // Pad do palco (px de tela): valor FIXO por lado, derivado só do zoom. Não
  // depende de seleção/arrasto → o layout nunca muda durante o uso e a folha
  // fica parada. Serve de respiro para as alças próximas da borda e de área
  // de rolagem alcançável (margens do .canvasFrame, definidas no JSX).
  const padX = Math.ceil(BASE_PAD_WORLD * scaleRatio) + 6;
  const padY = padX;

  // Ctrl+roda = zoom ancorado no cursor (estilo Photoshop).
  // Roda sem Ctrl segue rolando o container normalmente — incluindo sobre o
  // overlay, que rola manualmente o container (o overlay não é o scroller).
  useEffect(() => {
    const c = containerRef.current;
    const wrap = overlayWrapRef.current;
    if (!c) return;
    const onZoomWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const st = useEditor.getState();
      const fit = computeFitWidth();
      const oldScale = (fit * st.zoom) / POST_W;
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
        const newScale = (computeFitWidth() * s.zoom) / POST_W;
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
  }, [computeFitWidth]);

  // ---- Palco overlay (alças): posicionamento e geometria ----
  // O canvas do overlay nasce deslocado (folga) em relação à origem visual
  // do canvas principal, e o Transformer desenha em px crus do próprio
  // canvas. O alinhamento é 100% CSS: o wrap recebe um translate que o cola
  // na origem do canvas principal (menos a folga). A rolagem só move o wrap
  // via transform — sem redesenho e sem sincronizar transformes do Konva.
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
  }, [overlaySize.slackL, overlaySize.slackT]);

  // Rolagem move a folha na tela: re-alinha o overlay (só transform, as
  // alças acompanham o conteúdo sem redesenho)
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onScroll = () => syncOverlayPosition();
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => c.removeEventListener('scroll', onScroll);
  }, [syncOverlayPosition]);

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
  }, [displayWidth, displayHeight, padX, padY]);

  // Aplica a folga ao Transformer espelhado (soma na coordenada local, ver
  // o patch acima) e realinha o overlay após cada mudança de geometria.
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
  }, [overlaySize, syncOverlayPosition]);

  // ---- Watchdog da transformação ----
  // O `_handleMouseMove` do Konva não checa os botões do mouse: se o mouseup
  // acontece fora da página (cursor sai da janela, janela perde foco, aba é
  // trocada no meio do giro), o rotater fica "preso" e cada mousemove segue
  // girando/redimensionando o elemento sozinho. Encerramos a transformação
  // assim que qualquer sinal indica que o ponteiro não está pressionado.
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
  }, []);

  // ---- Ponte de eventos overlay -> palco principal ----
  // O overlay cobre toda a área visível, então cliques que não acertam uma
  // âncora do Transformer são repostos como eventos sintéticos no palco
  // principal: seleção, arraste de elemento, duplo clique e pan continuam
  // funcionando como antes. Arrastes em si não precisam de repostas extras:
  // o Konva prossegue o arraste ouvindo mousemove/touchmove no window.
  useEffect(() => {
    const wrap = overlayWrapRef.current;
    if (!wrap) return;
    const FORWARD_PROPS = (e: MouseEvent) => ({
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      button: e.button,
      buttons: e.buttons,
      detail: e.detail,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
    });
    const hitOverlay = (clientX: number, clientY: number) => {
      const ov = overlayStageRef.current;
      if (!ov) return null;
      const r = ov.container().getBoundingClientRect();
      return ov.getIntersection({ x: clientX - r.left, y: clientY - r.top });
    };
    const mainContent = () => {
      const st = stageRef.current;
      if (!st) return null;
      // O Konva escuta os eventos de DOM no div .konvajs-content (filho do
      // container), não no container — eventos despachados no pai nunca
      // alcançam os descendentes.
      return st.container().querySelector<HTMLElement>('.konvajs-content') ?? st.container();
    };
    const dispatchOnMain = (make: (target: HTMLElement) => Event) => {
      const target = mainContent();
      if (!target) return;
      target.dispatchEvent(make(target));
    };
    const hitMain = (clientX: number, clientY: number) => {
      const st = stageRef.current;
      if (!st) return null;
      const content = st.container().querySelector('.konvajs-content') ?? st.container();
      const r = content.getBoundingClientRect();
      return st.getIntersection({ x: clientX - r.left, y: clientY - r.top });
    };
    // Clique dentro da caixa de seleção (área do Transformer no overlay)
    const insideSelBox = (clientX: number, clientY: number) => {
      const tr = trRef.current;
      if (!tr || tr.nodes().length === 0) return false;
      const ov = overlayStageRef.current;
      if (!ov) return false;
      const ovr = ov.container().getBoundingClientRect();
      let r: { x: number; y: number; width: number; height: number };
      try {
        r = (tr as any)._getNodeRect();
      } catch {
        return false;
      }
      const sl = trRef.current as unknown as { _mirrorSlackX: number; _mirrorSlackY: number };
      const px = clientX - ovr.left;
      const py = clientY - ovr.top;
      return (
        px >= r.x + sl._mirrorSlackX - 2 &&
        px <= r.x + sl._mirrorSlackX + r.width + 2 &&
        py >= r.y + sl._mirrorSlackY - 2 &&
        py <= r.y + sl._mirrorSlackY + r.height + 2
      );
    };
    // Proxy-drag: o corpo do elemento está fora da folha (mascarado pelo clip
    // 3:4 no palco principal, logo sem hit), mas o clique é dentro da caixa de
    // seleção do overlay — move o nó diretamente e comita a posição no mouseup.
    const proxyDragRef = { current: null as null | {
      id: string; startX: number; startY: number; px: number; py: number; scale: number;
    } };
    const startProxyDrag = (e: MouseEvent) => {
      const tr = trRef.current;
      const node = tr && tr.nodes()[0];
      if (!node || !trRef.current?.nodes().length) return false;
      const st = useEditor.getState();
      const scale = ((computeFitWidth() * st.zoom) / POST_W) || 1;
      proxyDragRef.current = {
        id: String(node.id()),
        startX: node.x(),
        startY: node.y(),
        px: e.clientX,
        py: e.clientY,
        scale,
      };
      bridgeActiveRef.current = false;
      return true;
    };
    const onMouseDown = (e: MouseEvent) => {
      // Âncora/borda do Transformer: o Konva do overlay cuida nativamente
      if (hitOverlay(e.clientX, e.clientY)) return;
      if (!hitMain(e.clientX, e.clientY) && insideSelBox(e.clientX, e.clientY) && startProxyDrag(e)) {
        return;
      }
      bridgeActiveRef.current = true;
      dispatchOnMain(() => new MouseEvent('mousedown', FORWARD_PROPS(e)));
    };
    const onMouseMove = (e: MouseEvent) => {
      const proxy = proxyDragRef.current;
      if (proxy) {
        if (e.buttons === 0) {
          proxyDragRef.current = null;
          return;
        }
        const node = stageRef.current?.findOne(`#${proxy.id}`);
        if (node) {
          node.position({
            x: proxy.startX + (e.clientX - proxy.px) / proxy.scale,
            y: proxy.startY + (e.clientY - proxy.py) / proxy.scale,
          });
          handleDragMoveSnapRef.current(node);
        }
        return;
      }
      if (!bridgeActiveRef.current) return;
      if (e.buttons === 0) {
        bridgeActiveRef.current = false;
        return;
      }
      dispatchOnMain(() => new MouseEvent('mousemove', FORWARD_PROPS(e)));
    };
    const onMouseUp = (e: MouseEvent) => {
      const proxy = proxyDragRef.current;
      if (proxy) {
        proxyDragRef.current = null;
        const node = stageRef.current?.findOne(`#${proxy.id}`);
        if (node) {
          updateElement(proxy.id, {
            x: Math.round(node.x()),
            y: Math.round(node.y()),
          });
        }
        return;
      }
      if (!bridgeActiveRef.current) return;
      bridgeActiveRef.current = false;
      dispatchOnMain(() => new MouseEvent('mouseup', FORWARD_PROPS(e)));
    };
    const onDblClick = (e: MouseEvent) => {
      if (hitOverlay(e.clientX, e.clientY)) return;
      dispatchOnMain(() => new MouseEvent('dblclick', FORWARD_PROPS(e)));
    };
    const cloneTouch = (t: Touch) => {
      const target = stageRef.current?.container() ?? document.body;
      return new Touch({
        identifier: t.identifier,
        target,
        clientX: t.clientX,
        clientY: t.clientY,
        screenX: t.screenX,
        screenY: t.screenY,
        pageX: t.pageX,
        pageY: t.pageY,
        radiusX: (t as Touch & { radiusX?: number }).radiusX,
        radiusY: (t as Touch & { radiusY?: number }).radiusY,
        rotationAngle: t.rotationAngle,
        force: t.force,
      });
    };
    const onTouchStart = (e: TouchEvent) => {
      const t0 = e.changedTouches[0];
      if (!t0 || hitOverlay(t0.clientX, t0.clientY)) return;
      bridgeActiveRef.current = true;
      dispatchOnMain(() => {
        const touches: Touch[] = [];
        Array.from(e.touches).forEach((t) => touches.push(cloneTouch(t)));
        const changed: Touch[] = [];
        Array.from(e.changedTouches).forEach((t) => changed.push(cloneTouch(t)));
        return new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches,
          targetTouches: touches,
          changedTouches: changed,
        });
      });
    };
    wrap.addEventListener('mousedown', onMouseDown, true);
    wrap.addEventListener('mousemove', onMouseMove, true);
    wrap.addEventListener('mouseup', onMouseUp, true);
    wrap.addEventListener('dblclick', onDblClick, true);
    wrap.addEventListener('touchstart', onTouchStart, true);
    return () => {
      wrap.removeEventListener('mousedown', onMouseDown, true);
      wrap.removeEventListener('mousemove', onMouseMove, true);
      wrap.removeEventListener('mouseup', onMouseUp, true);
      wrap.removeEventListener('dblclick', onDblClick, true);
      wrap.removeEventListener('touchstart', onTouchStart, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Arrastar e soltar imagens do usuário ----
  // O soltar na folha importa o arquivo e posiciona a imagem no ponto do drop
  // (convertido para px do post). A janela inteira tem guard: sem preventDefault
  // em dragover/drop o navegador abre o arquivo em outra aba.
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
  }, []);

  // Espaço segurado = modo pan (arrastar move a rolagem, sem tocar nos elementos)
  const [panning, setPanning] = useState(false);
  const [panActive, setPanActive] = useState(false);
  const panningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    const isTyping = () => {
      const t = document.activeElement as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping()) return;
      e.preventDefault();
      panningRef.current = true;
      setPanning(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      panningRef.current = false;
      panStartRef.current = null;
      setPanning(false);
      setPanActive(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (!panActive) return;
    const move = (e: MouseEvent) => {
      const s = panStartRef.current;
      const c = containerRef.current;
      if (!s || !c) return;
      c.scrollLeft = s.sl - (e.clientX - s.x);
      c.scrollTop = s.st - (e.clientY - s.y);
    };
    const end = () => {
      panStartRef.current = null;
      setPanActive(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
    };
  }, [panActive]);

  const handlePanMouseDown = (e: React.MouseEvent) => {
    if (!panningRef.current) return;
    // Captura antes do Konva: nem seleciona nem arrasta elementos
    e.stopPropagation();
    e.preventDefault();
    const c = containerRef.current;
    if (!c) return;
    panStartRef.current = { x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop };
    setPanActive(true);
  };

  // Caixa medida do texto em edição (px do post, com pads) para o editor in-place
  const [editBox, setEditBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setEditBox(null);
  }, [editingId]);
  const handleMeasure = useCallback((w: number, h: number) => {
    setEditBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);

  // Fecha a edição in-place e devolve a seleção ao texto
  const closeEditing = useCallback(() => {
    if (!editingId) return;
    setEditing(null);
    select(editingId);
  }, [editingId, select, setEditing]);

  // Atualiza o nó anexado ao Transformer
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;

    let cancelled = false;
    const attach = (attempt: number) => {
      if (cancelled) return;

      // Sem Transformer durante a edição in-place de texto (estilo Photoshop)
      if (!selectedId || selectedId === editingId) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
        return;
      }

      const selectedNode = stage.findOne(`#${selectedId}`);
      if (selectedNode) {
        tr.nodes([selectedNode]);
        tr.getLayer()?.batchDraw();
      } else if (attempt < 60) {
        // O nó pode ainda não existir: o Image do Konva só monta quando o
        // asset termina de carregar (DecorationNode/ImageNode renderizam null),
        // e nenhuma alteração no doc vai disparar um re-render do React. Tentar
        // novamente sem esperar por uma alteração de estado (imagens do usuário
        // decodificam de forma assíncrona, então há algumas tentativas extras).
        requestAnimationFrame(() => attach(attempt + 1));
      }
    };
    attach(0);
    return () => {
      cancelled = true;
    };
  }, [selectedId, editingId, doc.elements]);

  // Alinhamento preciso à página via bounding box relativo à camada
  const alignSelected = useCallback(
    (mode: AlignMode) => {
      if (!selectedId || !stageRef.current || !layerRef.current) return;
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (!node) return;

      const layer = layerRef.current;
      const box = node.getClientRect({ relativeTo: layer });

      const { dx, dy } = alignDelta(box, mode, POST_W, POST_H);

      const el = doc.elements.find((e) => e.id === selectedId);
      if (!el) return;

      updateElement(selectedId, {
        x: Math.round(node.x() + dx),
        y: Math.round(node.y() + dy),
      });
    },
    [selectedId, doc.elements, updateElement]
  );

  useImperativeHandle(
    ref,
    () => ({
      getStage: () => stageRef.current,
      getDisplayWidth: () => displayWidth,
      alignSelected,
    }),
    [displayWidth, alignSelected]
  );

  // Lógica de imã (snap) no centro + nas guias de layout durante o arrasto
  const handleDragMoveSnap = (node: Konva.Node) => {
    if (!layerRef.current) return;
    const box = node.getClientRect({ relativeTo: layerRef.current });
    const snap = snapToCenter(box, POST_W, POST_H, 16);

    let dx = snap.dx;
    let dy = snap.dy;
    let v = snap.v;
    let h = snap.h;

    // Ímã nas guias visíveis (margens/centro/terços), aplicado sobre a
    // posição já ajustada pelo snap central.
    if (layoutGuides.visible && (layoutGuides.showMargins || layoutGuides.showCenters || layoutGuides.showThirds)) {
      const shifted = { ...box, x: box.x + dx, y: box.y + dy };
      const gsnap = snapToGuides(
        shifted,
        POST_W,
        POST_H,
        {
          margin: layoutGuides.margin,
          useMargins: layoutGuides.showMargins,
          useCenters: layoutGuides.showCenters,
          useThirds: layoutGuides.showThirds,
        },
        GUIDE_SNAP_THRESHOLD
      );
      dx += gsnap.dx;
      dy += gsnap.dy;
    }

    if (dx !== 0) {
      node.x(node.x() + dx);
    }
    if (dy !== 0) {
      node.y(node.y() + dy);
    }

    setGuides({ v, h });
  };
  // A ponte de eventos é vinculada só no mount (deps []): o proxy-drag usa
  // sempre a closure mais recente do snap via ref.
  handleDragMoveSnapRef.current = handleDragMoveSnap;

  const handleDragEndSnap = () => {
    setGuides({ v: false, h: false });
  };

  const editingElement = doc.elements.find(
    (e): e is TextEl => e.id === editingId && e.kind === 'text'
  );

  return (
    <>
    <div
      ref={containerRef}
      className={`${styles.container} ${panning ? styles.panning : ''} ${panActive ? styles.panActive : ''}`}
      onMouseDownCapture={handlePanMouseDown}
    >
      <div
        className={styles.canvasFrame}
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
          // Margens = espaço físico do pad do palco, com valor FIXO derivado do
          // zoom: a área de rolagem alcançável existe, mas as margens nunca
          // mudam com seleção/arrasto → a folha fica emperrada no lugar
          margin: `${padY}px ${padX}px`,
        }}
      >
        {/* Fitinha adesiva decorativa grudada na folha */}
        <div className={styles.washiTape} />
        {/* Recorta o palco aos limites da folha (com os cantos da borda) */}
        <div className={styles.sheetClip}>
        <Stage
          ref={stageRef}
          width={displayWidth + padX * 2}
          height={displayHeight + padY * 2}
          x={padX}
          y={padY}
          scaleX={scaleRatio}
          scaleY={scaleRatio}
          style={{ position: 'relative', left: -padX, top: -padY }}
          onMouseDown={(e) => {
            // Desmarca ao clicar na área vazia do palco
            if (e.target === e.target.getStage()) {
              select(null);
              setEditing(null);
            }
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) {
              select(null);
              setEditing(null);
            }
          }}
        >
          <Layer ref={layerRef}>
            {/* A arte toda fica recortada nos limites 3:4 (o palco é maior
                que a folha para as alças do Transformer aparecerem fora dela) */}
            <Group clipX={0} clipY={0} clipWidth={POST_W} clipHeight={POST_H}>
            {/* Fundo 3:4 Fixo e Travado */}
            <BackgroundNode backgroundId={doc.backgroundId} />

            {/* Elementos em ordem de camada */}
            {doc.elements.map((el) => {
              if (el.kind === 'decoration') {
                return (
                  <DecorationNode
                    key={el.id}
                    element={el as DecorationEl}
                    isSelected={selectedId === el.id}
                    onSelect={() => select(el.id)}
                    onChange={(patch) => updateElement(el.id, patch)}
                    onDragMoveSnap={handleDragMoveSnap}
                    onDragEndSnap={handleDragEndSnap}
                  />
                );
              }
              if (el.kind === 'text') {
                return (
                  <TextNode
                    key={el.id}
                    element={el as TextEl}
                    isSelected={selectedId === el.id}
                    isEditing={editingId === el.id}
                    onSelect={() => select(el.id)}
                    onDoubleClick={() => {
                      select(null);
                      setEditing(el.id);
                    }}
                    onChange={(patch) => updateElement(el.id, patch)}
                    onApplyTextSize={(req) => setTextSize(el.id, req)}
                    onMeasure={editingId === el.id ? handleMeasure : undefined}
                    onDragMoveSnap={handleDragMoveSnap}
                    onDragEndSnap={handleDragEndSnap}
                  />
                );
              }
              if (el.kind === 'image') {
                return (
                  <ImageNode
                    key={el.id}
                    element={el as ImageEl}
                    isSelected={selectedId === el.id}
                    onSelect={() => select(el.id)}
                    onChange={(patch) => updateElement(el.id, patch)}
                    onDragMoveSnap={handleDragMoveSnap}
                    onDragEndSnap={handleDragEndSnap}
                  />
                );
              }
              if (el.kind === 'logo') {
                return (
                  <LogoNode
                    key={el.id}
                    element={el as LogoEl}
                    isSelected={selectedId === el.id}
                    onSelect={() => select(el.id)}
                    onChange={(patch) => updateElement(el.id, patch)}
                    onDragMoveSnap={handleDragMoveSnap}
                    onDragEndSnap={handleDragEndSnap}
                  />
                );
              }
              return null;
            })}

            {/* Acabamento do post (passo 6: papel + grain) */}
            <TextureOverlays finish={finish} />
            </Group>

            {/* Guias de layout estilo Photoshop (margens/centro/terços) */}
            {layoutGuides.visible && (
              <LayoutGuides
                margin={layoutGuides.margin}
                showMargins={layoutGuides.showMargins}
                showCenters={layoutGuides.showCenters}
                showThirds={layoutGuides.showThirds}
              />
            )}

            {/* Linhas guias de snap no centro */}
            <SnapGuides v={guides.v} h={guides.h} />
          </Layer>
        </Stage>
        </div>
      </div>

      {/* Editor de texto in-place ao dar duplo clique (estilo Photoshop) */}
      {editingElement && (
        <InlineTextEditor
          element={editingElement}
          boxW={editBox?.w ?? null}
          boxH={editBox?.h ?? null}
          scaleRatio={scaleRatio}
          stageRect={(() => {
            const r = stageRef.current?.container()?.getBoundingClientRect();
            // O contêiner começa padX/padY px antes da folha; devolve a origem
            // da folha (origem do mundo do palco) já em coordenadas de tela.
            return r ? { left: r.left + padX, top: r.top + padY } : null;
          })()}
          onClose={closeEditing}
        />
      )}

      {/* Overlay de arrastar-e-soltar arquivos (visual apenas: pointer-events none) */}
      {dragOverFiles && (
        <div className={styles.dropOverlay} aria-hidden="true">
          <span>Solta as imagens aqui! 🌽</span>
        </div>
      )}
    </div>

    {/* Palco overlay: alças + caixa de seleção do Transformer. Canvas irmão
        do principal, alinhado por CSS (translate no wrap) à origem dele e com
        folga para as alças em qualquer posição de arrasto. O conteúdo fora da
        folha continua mascarado no palco principal; cliques que não acertam
        âncoras são repostos no palco principal pela ponte. */}
    <div
      ref={overlayWrapRef}
      className={`${styles.handleOverlay} ${panActive ? styles.panActive : ''}`}
      onMouseDownCapture={handlePanMouseDown}
    >
      <Stage ref={overlayStageRef} width={overlaySize.w} height={overlaySize.h}>
        <Layer>
          {/* Stage em identidade (sem x/y/scale): o Transformer desenha em px
              crus do canvas, e o wrap posiciona esse canvas exatamente sobre
              o canvas principal. Os nós seguem sendo os do palco principal
              (attach via stageRef.findOne no efeito de attach). */}
          <MirrorTransformerEl
            ref={trRef}
            keepRatio
            enabledAnchors={[
              'top-left',
              'top-right',
              'bottom-left',
              'bottom-right',
            ]}
            rotateEnabled
            borderStroke={COLORS.verde}
            borderStrokeWidth={3}
            borderDash={[6, 4]}
            anchorFill={COLORS.amarelo}
            anchorStroke={COLORS.preto}
            anchorStrokeWidth={2}
            anchorSize={16}
            anchorCornerRadius={4}
            boundBoxFunc={(oldBox, newBox) => {
              // Impede que fique menor que 20px ou invertido (sem Math.abs:
              // largura/altura negativas = caixa invertida, que dispara o flip
              // espontâneo do enfeite no meio do arrasto).
              if (newBox.width < 20 || newBox.height < 20) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>
    </div>
    </>
  );
});

EditorCanvas.displayName = 'EditorCanvas';

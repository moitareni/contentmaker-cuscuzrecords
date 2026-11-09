import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import Konva from 'konva';
import { COLORS, GUIDE_SNAP_THRESHOLD, getPostDimensions } from '../brand/brand';
import { alignDelta, snapToCenter, snapToGuides } from '../lib/align';
import { CROSSOVER_ZONE, canElementBleedToSide } from '../lib/crossover';
import {
  buildTransformPatches,
  groupLimitMessage,
  groupScaleBounds,
  isMultiModifier,
  unionBox,
  type GroupScaleBounds,
} from '../lib/multiSelect';
import { useCarousel } from '../store/carouselStore';
import { useEditor } from '../store/editorStore';

import type { AlignMode, Box, DecorationEl, El, ImageEl, LogoEl, TextEl } from '../types';
import { CrossoverMirrorNode } from './CrossoverMirrorNode';
import { MirrorTransformerEl } from './mirrorTransformer';
import { useCanvasFitWidth } from './hooks/useCanvasFitWidth';
import { useFileDrop } from './hooks/useFileDrop';
import { usePanMode } from './hooks/usePanMode';
import { useTransformWatchdog } from './hooks/useTransformWatchdog';
import { useGroupDrag } from './hooks/useGroupDrag';
import { useOverlayGeometry } from './hooks/useOverlayGeometry';
import { useZoomWheel } from './hooks/useZoomWheel';
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
 * O patch no `Konva.Transformer.prototype`, a subclasse registrada e os tipos
 * do espelho vivem em `./mirrorTransformer.ts`; a geometria do overlay no
 * hook `useOverlayGeometry`; eventos do overlay que não acertam uma âncora
 * são repostos ("bridge") no palco principal para seleção/arraste/duplo
 * clique/pan continuarem iguais.
 */

/** Seleção múltipla: nenhum elemento pode encolher a ponto de o maior lado ficar < 20px do post. */
const GROUP_MIN_SIDE = 20;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface GroupXform {
  /** Largura da caixa do Transformer no início (px do canvas). */
  startW: number;
  bounds: GroupScaleBounds;
  /** Piso do fator para nenhum elemento sumir (≤ 1). */
  minFactor: number;
}

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
  // Snap e commit do proxy-drag sempre via as closures mais recentes do componente
  const handleDragMoveSnapRef = useRef<(node: Konva.Node) => void>(() => {});
  const handleDragEndSnapRef = useRef<() => void>(() => {});
  const changeElRef = useRef<(id: string, patch: Partial<El>) => void>(() => {});
  // Preenchido no transformstart de uma seleção múltipla; limpo logo após o transformend
  const groupXformRef = useRef<GroupXform | null>(null);
  const lastLimitToastRef = useRef(0);

  const doc = useEditor((s) => s.doc);
  const selectedIds = useEditor((s) => s.selectedIds);
  const editingId = useEditor((s) => s.editingId);
  const guides = useEditor((s) => s.guides);
  const layoutGuides = useEditor((s) => s.layoutGuides);
  const finish = useEditor((s) => s.finish);

  const carouselMode = useCarousel((s) => s.mode);
  const carouselSlides = useCarousel((s) => s.slides);
  const activeSlideIndex = useCarousel((s) => s.activeSlideIndex);
  const [crossoverHint, setCrossoverHint] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const select = useEditor((s) => s.select);
  const toggleSelect = useEditor((s) => s.toggleSelect);
  const applyPatches = useEditor((s) => s.applyPatches);
  const setEditing = useEditor((s) => s.setEditing);
  const setGuides = useEditor((s) => s.setGuides);
  const updateElement = useEditor((s) => s.updateElement);
  const setTextSize = useEditor((s) => s.setTextSize);
  const setBackgroundOffsetY = useEditor((s) => s.setBackgroundOffsetY);
  const step = useEditor((s) => s.step);

  const format = doc.format ?? '3:4';
  const { width: postW, height: postH } = getPostDimensions(format);
  const backgroundOffsetY = doc.backgroundOffsetY ?? 180;

  // Largura de ajuste à tela (fit) mantendo a proporção do post.
  // A exibição real é fit × zoom; o hook devolve os valores derivados em px de tela.
  const { computeFitWidth, displayWidth, displayHeight, scaleRatio, padX, padY } = useCanvasFitWidth(containerRef);

  // Ctrl+roda = zoom ancorado no cursor; roda simples = scroll manual.
  useZoomWheel(containerRef, overlayWrapRef, stageRef, computeFitWidth);
  // ---- Palco overlay (alças): posicionamento e geometria (hook) ----
  const { overlaySize } = useOverlayGeometry(
    containerRef,
    stageRef,
    overlayWrapRef,
    trRef,
    displayWidth,
    displayHeight,
    padX,
    padY,
  );
  // Encerra transformações "fantasma" (mouseup perdido fora da página)
  useTransformWatchdog(trRef);

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
      const currentPostW = getPostDimensions(st.doc.format).width;
      const scale = ((computeFitWidth() * st.zoom) / currentPostW) || 1;
      proxyDragRef.current = {
        id: String(node.id()),
        startX: node.x(),
        startY: node.y(),
        px: e.clientX,
        py: e.clientY,
        scale,
      };
      // Seleção múltipla: o líder é o 1º nó; os demais seguem (ver handleDragMoveSnap).
      groupApiRef.current.begin(node);
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
          // mouseup perdido: encerra como um soltar (comita o conjunto, sem estado preso)
          groupApiRef.current.end();
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
        handleDragEndSnapRef.current();
        if (groupApiRef.current.active()) {
          groupApiRef.current.end();
          return;
        }
        const node = stageRef.current?.findOne(`#${proxy.id}`);
        if (node) {
          changeElRef.current(proxy.id, {
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
      if (hitOverlay(e.clientX, e.clientY) || isMultiModifier(e)) return;
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

  // Arrastar e soltar imagens do usuário (guard de janela + drop na folha)
  const { dragOverFiles } = useFileDrop(containerRef, stageRef);

  // Espaço segurado = modo pan (arrastar move a rolagem, sem tocar nos elementos)
  const { panning, panActive, handlePanMouseDown } = usePanMode(containerRef);

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
      const ids = selectedIds.filter((id) => id !== editingId);
      if (ids.length === 0) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
        return;
      }

      const found = ids
        .map((id) => stage.findOne(`#${id}`))
        .filter((n): n is Konva.Node => !!n);
      if (found.length > 0) {
        tr.nodes(found);
        tr.getLayer()?.batchDraw();
      }
      if (found.length < ids.length && attempt < 60) {
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
  }, [selectedIds, editingId, doc.elements]);

  // Alinhamento preciso à página via bounding box relativo à camada
  const alignSelected = useCallback(
    (mode: AlignMode) => {
      if (selectedIds.length === 0 || !stageRef.current || !layerRef.current) return;
      const stage = stageRef.current;
      const layer = layerRef.current;
      const nodes = selectedIds
        .map((id) => stage.findOne(`#${id}`))
        .filter((n): n is Konva.Node => !!n);
      if (nodes.length === 0) return;

      // Conjunto: alinha a caixa da UNIÃO à página (o grupo anda como uma peça só).
      const box =
        unionBox(nodes.map((n) => n.getClientRect({ relativeTo: layer }))) ??
        nodes[0].getClientRect({ relativeTo: layer });
      const { dx, dy } = alignDelta(box, mode, postW, postH);

      if (nodes.length === 1) {
        const node = nodes[0];
        const el = doc.elements.find((e) => e.id === selectedIds[0]);
        if (!el) return;
        updateElement(selectedIds[0], {
          x: Math.round(node.x() + dx),
          y: Math.round(node.y() + dy),
        });
        return;
      }
      applyPatches(
        nodes.map((n) => ({
          id: String(n.id()),
          patch: { x: round2(n.x() + dx), y: round2(n.y() + dy) },
        })),
      );
    },
    [selectedIds, doc.elements, updateElement, applyPatches]
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
    // Seleção múltipla: só o líder roda o snap, sobre a caixa da UNIÃO (a do início
    // do arraste deslocada pelo quanto o líder já andou) — o conjunto não deforma.
    const g = groupDragRef.current;
    const isLeader = !!g && String(node.id()) === g.leaderId;
    const box: Box =
      g && isLeader
        ? {
            ...g.startBox,
            x: g.startBox.x + (node.x() - g.leaderStart.x),
            y: g.startBox.y + (node.y() - g.leaderStart.y),
          }
        : node.getClientRect({ relativeTo: layerRef.current });
    const snap = snapToCenter(box, postW, postH, 16);

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
        postW,
        postH,
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

    // Seguidores: mesma translação do líder desde o início (já com o snap aplicado).
    if (g && isLeader) {
      const stage = stageRef.current;
      const ddx = node.x() - g.leaderStart.x;
      const ddy = node.y() - g.leaderStart.y;
      g.starts.forEach((s, id) => {
        if (id === g.leaderId) return;
        stage?.findOne(`#${id}`)?.position({ x: s.x + ddx, y: s.y + ddy });
      });
    }

    // Zona de Sangria bidirecional (80px na borda esquerda e/ou direita) em Modo Carrossel
    const cState = useCarousel.getState();
    if (cState.mode === 'carousel' && cState.slides.length > 1) {
      const hasPrev = cState.activeSlideIndex > 0;
      const hasNext = cState.activeSlideIndex < cState.slides.length - 1;
      const nodeRect = node.getClientRect({ relativeTo: layerRef.current });
      const nearLeft = hasPrev && nodeRect.x < CROSSOVER_ZONE && node.x() < postW / 2;
      const nearRight =
        hasNext && nodeRect.x + nodeRect.width > postW - CROSSOVER_ZONE && node.x() > postW / 2;
      setCrossoverHint((prev) =>
        prev.left === nearLeft && prev.right === nearRight
          ? prev
          : { left: nearLeft, right: nearRight },
      );
    } else if (crossoverHint.left || crossoverHint.right) {
      setCrossoverHint({ left: false, right: false });
    }

    setGuides({ v, h });
  };
  // A ponte de eventos é vinculada só no mount (deps []): o proxy-drag usa
  // sempre a closure mais recente do snap via ref.
  handleDragMoveSnapRef.current = handleDragMoveSnap;

  // Arraste em conjunto (início/fim + API para a ponte de eventos)
  const { groupDragRef, groupApiRef, beginGroupDrag, endGroupDrag } = useGroupDrag(
    stageRef,
    layerRef,
    applyPatches,
    setGuides,
  );

  /** Commit por nó, silenciado quando o conjunto está comitando em lote (arraste/transformação). */
  const changeEl = (id: string, patch: Partial<El>) => {
    if (groupDragRef.current || groupXformRef.current) return;
    let nextPatch = patch;
    if ('x' in patch && useCarousel.getState().mode === 'carousel') {
      const cState = useCarousel.getState();
      const hasPrev = cState.activeSlideIndex > 0;
      const hasNext = cState.activeSlideIndex < cState.slides.length - 1;
      const el = doc.elements.find((e) => e.id === id);
      if (hasPrev || hasNext) {
        const node = stageRef.current?.findOne(`#${id}`);
        const nodeRect =
          node && layerRef.current ? node.getClientRect({ relativeTo: layerRef.current }) : null;
        const centerX = patch.x ?? (node ? node.x() : el?.x ?? postW / 2);
        const elementLeftEdge = nodeRect ? nodeRect.x : centerX;
        const elementRightEdge = nodeRect ? nodeRect.x + nodeRect.width : centerX;
        const isNearLeftEdge =
          hasPrev &&
          ((elementLeftEdge < 0 && elementRightEdge > 0) ||
            (elementLeftEdge < CROSSOVER_ZONE && centerX < postW / 2));
        const isNearRightEdge =
          hasNext &&
          ((elementLeftEdge < postW && elementRightEdge > postW) ||
            (elementRightEdge > postW - CROSSOVER_ZONE && centerX > postW / 2));
        if (isNearLeftEdge || isNearRightEdge) {
          nextPatch = { ...patch, crossover: true };
        } else if (el?.crossover) {
          nextPatch = { ...patch, crossover: false };
        }
      } else if (el?.crossover) {
        nextPatch = { ...patch, crossover: false };
      }
    }
    updateElement(id, nextPatch);
  };
  changeElRef.current = changeEl;
  const applyTextSize = (id: string, requested: number) =>
    groupXformRef.current ? requested : setTextSize(id, requested);

  /** Seleção: Ctrl/Cmd/Shift soma/remove; clique simples seleciona só este. */
  const handleSelect = (id: string, e?: { evt?: MouseEvent | TouchEvent }) => {
    if (isMultiModifier(e?.evt)) toggleSelect(id);
    else select(id);
  };

  const notifyGroupLimit = (message: string | null) => {
    if (!message) return;
    const now = Date.now();
    if (now - lastLimitToastRef.current < 1500) return;
    lastLimitToastRef.current = now;
    useEditor.getState().showToast('error', message);
  };

  // Transformer em conjunto: guarda largura inicial + limites (Texto ≤ Título, não sumir)
  const handleTrTransformStart = () => {
    groupDragRef.current = null; // nunca deixa estado de arraste preso
    const tr = trRef.current;
    const layer = layerRef.current;
    const nodes = tr?.nodes() ?? [];
    if (!tr || !layer || nodes.length < 2) {
      groupXformRef.current = null;
      return;
    }
    const bounds = groupScaleBounds(
      useEditor.getState().doc.elements,
      nodes.map((n) => String(n.id())),
    );
    let minFactor = 0;
    for (const n of nodes) {
      const r = n.getClientRect({ relativeTo: layer });
      const side = Math.max(r.width, r.height);
      if (side > 0) minFactor = Math.max(minFactor, Math.min(1, GROUP_MIN_SIDE / side));
    }
    groupXformRef.current = { startW: tr.width(), bounds, minFactor };
  };

  // Commit em lote ÚNICO: o Konva dispara este handler ANTES do transformend de cada nó,
  // então as escalas ainda estão intactas aqui. Os nós ficam silenciados (changeEl) até o
  // próximo tick.
  const handleTrTransformEnd = () => {
    const nodes = trRef.current?.nodes() ?? [];
    if (nodes.length >= 2) {
      const results = nodes.map((n) => ({
        id: String(n.id()),
        x: n.x(),
        y: n.y(),
        rotation: n.rotation(),
        scaleX: n.scaleX(),
      }));
      applyPatches(buildTransformPatches(useEditor.getState().doc.elements, results));
    }
    setTimeout(() => {
      groupXformRef.current = null;
    }, 0);
  };

  const handleDragEndSnap = () => {
    setGuides({ v: false, h: false });
    setCrossoverHint({ left: false, right: false });
  };
  handleDragEndSnapRef.current = handleDragEndSnap;

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
            // Desmarca ao clicar na área vazia do palco (Ctrl/Cmd/Shift preserva a seleção)
            if (e.target === e.target.getStage()) {
              if (isMultiModifier(e.evt)) return;
              select(null);
              setEditing(null);
            }
          }}
          onDragStart={(e) => beginGroupDrag(e.target)}
          onDragEnd={endGroupDrag}
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
            <Group clipX={0} clipY={0} clipWidth={postW} clipHeight={postH}>
            {/* Fundo */}
            <BackgroundNode
              backgroundId={doc.backgroundId}
              flipX={doc.backgroundFlipX}
              flipY={doc.backgroundFlipY}
              format={format}
              offsetY={backgroundOffsetY}
              isInteractive={step === 0 && format === '1:1'}
              onOffsetYChange={setBackgroundOffsetY}
            />

            {/* Elementos em ordem de camada */}
            {doc.elements.map((el) => {
              if (el.kind === 'decoration') {
                return (
                  <DecorationNode
                    key={el.id}
                    element={el as DecorationEl}
                    isSelected={selectedIds.includes(el.id)}
                    onSelect={(e) => handleSelect(el.id, e)}
                    onChange={(patch) => changeEl(el.id, patch)}
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
                    isSelected={selectedIds.includes(el.id)}
                    isEditing={editingId === el.id}
                    onSelect={(e) => handleSelect(el.id, e)}
                    onDoubleClick={(e) => {
                      if (isMultiModifier(e?.evt as MouseEvent) || selectedIds.length > 1) return;
                      select(null);
                      setEditing(el.id);
                    }}
                    onChange={(patch) => changeEl(el.id, patch)}
                    onApplyTextSize={(req) => applyTextSize(el.id, req)}
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
                    isSelected={selectedIds.includes(el.id)}
                    onSelect={(e) => handleSelect(el.id, e)}
                    onChange={(patch) => changeEl(el.id, patch)}
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
                    isSelected={selectedIds.includes(el.id)}
                    onSelect={(e) => handleSelect(el.id, e)}
                    onChange={(patch) => changeEl(el.id, patch)}
                    onDragMoveSnap={handleDragMoveSnap}
                    onDragEndSnap={handleDragEndSnap}
                  />
                );
              }
              return null;
            })}

            {/* Fallback de Continuação Visual dos elementos do slide anterior (quando ainda não materializados no doc ativo) */}
            {carouselMode === 'carousel' &&
              activeSlideIndex > 0 &&
              (
                carouselSlides[activeSlideIndex - 1]?.doc.elements.filter(
                  (e) =>
                    canElementBleedToSide(e, 'right', postW) &&
                    !doc.elements.some((cur) => cur.id === e.id),
                ) ?? []
              ).map((el) => (
                <CrossoverMirrorNode
                  key={`mirror-prev-${el.id}`}
                  element={el}
                  offsetX={-postW}
                  listening={false}
                />
              ))}

            {/* Fallback de Continuação Visual dos elementos do slide seguinte (quando ainda não materializados no doc ativo) */}
            {carouselMode === 'carousel' &&
              activeSlideIndex < carouselSlides.length - 1 &&
              (
                carouselSlides[activeSlideIndex + 1]?.doc.elements.filter(
                  (e) =>
                    canElementBleedToSide(e, 'left', postW) &&
                    !doc.elements.some((cur) => cur.id === e.id),
                ) ?? []
              ).map((el) => (
                <CrossoverMirrorNode
                  key={`mirror-next-${el.id}`}
                  element={el}
                  offsetX={postW}
                  listening={false}
                />
              ))}

            {/* Zona de Sangria na borda esquerda (80px) ao arrastar elemento próximo à borda com slide anterior */}
            {crossoverHint.left && (
              <Rect
                x={0}
                y={0}
                width={80}
                height={postH}
                fill="#f8ce2b"
                opacity={0.15}
                listening={false}
              />
            )}

            {/* Zona de Sangria na borda direita (80px) ao arrastar elemento próximo à borda com slide seguinte */}
            {crossoverHint.right && (
              <Rect
                x={postW - 80}
                y={0}
                width={80}
                height={postH}
                fill="#f8ce2b"
                opacity={0.15}
                listening={false}
              />
            )}

            {/* Acabamento do post (passo 6: papel + grain) */}
            <TextureOverlays
              finish={finish}
              format={format}
              postWidth={postW}
              postHeight={postH}
            />
            </Group>

            {/* Guias de layout estilo Photoshop (margens/centro/terços) */}
            {layoutGuides.visible && (
              <LayoutGuides
                margin={layoutGuides.margin}
                showMargins={layoutGuides.showMargins}
                showCenters={layoutGuides.showCenters}
                showThirds={layoutGuides.showThirds}
                postWidth={postW}
                postHeight={postH}
              />
            )}

            {/* Linhas guias de snap no centro */}
            <SnapGuides v={guides.v} h={guides.h} postWidth={postW} postHeight={postH} />
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
            onTransformStart={handleTrTransformStart}
            onTransformEnd={handleTrTransformEnd}
            boundBoxFunc={(oldBox, newBox) => {
              // Impede que fique menor que 20px ou invertido (sem Math.abs:
              // largura/altura negativas = caixa invertida, que dispara o flip
              // espontâneo do enfeite no meio do arrasto).
              if (newBox.width < 20 || newBox.height < 20) {
                return oldBox;
              }
              if (!groupXformRef.current && (trRef.current?.nodes()?.length ?? 0) >= 2) {
                handleTrTransformStart();
              }
              // Seleção múltipla: fator de escala dentro dos limites do conjunto
              // (Texto ≤ Título e nenhum elemento some). Rotação/movimento (f≈1) passam.
              const g = groupXformRef.current;
              if (g && g.startW > 0) {
                const f = newBox.width / g.startW;
                if (Math.abs(f - 1) > 1e-3) {
                  if (f > g.bounds.max) {
                    notifyGroupLimit(groupLimitMessage(g.bounds.maxReason, 'max'));
                    return oldBox;
                  }
                  const lo = Math.max(g.bounds.min, g.minFactor);
                  if (f < lo) {
                    notifyGroupLimit(g.bounds.min >= g.minFactor ? groupLimitMessage(g.bounds.minReason, 'min') : null);
                    return oldBox;
                  }
                }
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

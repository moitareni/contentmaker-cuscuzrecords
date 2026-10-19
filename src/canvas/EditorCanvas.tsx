import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Group, Layer, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { COLORS, GUIDE_SNAP_THRESHOLD, POST_H, POST_W } from '../brand/brand';
import { alignDelta, snapToCenter, snapToGuides } from '../lib/align';
import { clampZoom } from '../lib/zoom';
import { useEditor } from '../store/editorStore';
import type { AlignMode, DecorationEl, LogoEl, TextEl } from '../types';
import { BackgroundNode } from './BackgroundNode';
import { DecorationNode } from './DecorationNode';
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
 * Alças de ajuste do Transformer fora da folha: o palco estende além dos
 * limites da página no espaço de POST (px de post; vira px de tela por
 * scaleRatio). Base 52 px de post por lado cobre a âncora de rotação (até
 * ~41px de post do retângulo selecionado) + folga de traços. Quando o
 * elemento selecionado estoura a folha, o palco cresce junto — a medida
 * ("overhang") é atualizada a cada commit de gesto no `EditorCanvas`.
 */
const BASE_PAD_WORLD = 52;
const HANDLE_REACH_WORLD = 47; // âncora de rotação ~41 + 6 de traço

export const EditorCanvas = forwardRef<EditorCanvasHandle>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);

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

  // Quanto o elemento selecionado ultrapassa a folha (px de post, por lado).
  // Dirige o pad adaptativo do palco: alças sempre visíveis, mesmo quando o
  // elemento é grande/arrastado bem além dos limites da página.
  const [overhang, setOverhang] = useState({ l: 0, t: 0, r: 0, b: 0 });

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
  // Pad do palco (px de tela): base + a ultrapassagem do selecionado, por
  // lado. Guarda de memória: o canvas do Konva não pode estourar o limite do
  // Chrome (~268M px de backing); acima de ~80M os pads extras são comprimidos
  // proporcionalmente (caso extremo: elemento gigante + zoom máximo).
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const padScreen = (world: number) =>
    Math.ceil(
      Math.max(BASE_PAD_WORLD, world + HANDLE_REACH_WORLD) * scaleRatio
    ) + 6;
  let padL = padScreen(overhang.l);
  let padR = padScreen(overhang.r);
  let padT = padScreen(overhang.t);
  let padB = padScreen(overhang.b);
  const MAX_BACKING_AREA = 80_000_000;
  for (let i = 0; i < 4; i++) {
    const area =
      (displayWidth + padL + padR) * (displayHeight + padT + padB) * dpr * dpr;
    if (area <= MAX_BACKING_AREA) break;
    const k = Math.sqrt(MAX_BACKING_AREA / area);
    padL = Math.ceil(padL * k);
    padR = Math.ceil(padR * k);
    padT = Math.ceil(padT * k);
    padB = Math.ceil(padB * k);
  }

  // Ctrl+roda = zoom ancorado no cursor (estilo Photoshop).
  // Roda sem Ctrl segue rolando o container normalmente.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
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
        // O contêiner do palco começa padL/padT px antes da folha
        // (CSS offset −pad); desconta para ancorar no ponto do post.
        sx = e.clientX - rect.left - stage.x();
        sy = e.clientY - rect.top - stage.y();
        anchored = true;
      }
      st.setZoom(nextZoom);
      if (!anchored) return;

      // Recompensa a rolagem para o ponto continuar sob o cursor
      requestAnimationFrame(() => {
        const c = containerRef.current;
        if (!c) return;
        const s = useEditor.getState();
        const newScale = (computeFitWidth() * s.zoom) / POST_W;
        c.scrollLeft += (sx / oldScale) * newScale - sx;
        c.scrollTop += (sy / oldScale) * newScale - sy;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [computeFitWidth]);

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
      } else if (attempt < 8) {
        // O nó pode ainda não existir: o Image do Konva só monta quando o
        // asset termina de carregar (DecorationNode renderiza null), e nenhum
        // re-render do React acontecerá até o doc mudar. Tenta de novo sem
        // esperar por um state change.
        requestAnimationFrame(() => attach(attempt + 1));
      }
    };
    attach(0);
    return () => {
      cancelled = true;
    };
  }, [selectedId, editingId, doc.elements]);

  // Mede a ultrapassagem do elemento selecionado além da folha (px de post)
  // para estender o palco até as alças. Os nós comitam ao doc apenas no fim
  // do gesto (dragend/transformend), então isto roda barato — sem churn por
  // frame durante o arrasto. Se o nó ainda não existe (asset carregando),
  // re-tenta por alguns frames, igual ao efeito do Transformer.
  useEffect(() => {
    let cancelled = false;
    const measure = (attempt: number) => {
      if (cancelled) return;
      const stage = stageRef.current;
      const layer = layerRef.current;
      if (!stage || !layer) return;
      const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
      if (!node) {
        if (attempt < 8 && selectedId) {
          requestAnimationFrame(() => measure(attempt + 1));
          return;
        }
        setOverhang({ l: 0, t: 0, r: 0, b: 0 });
        return;
      }
      const box = node.getClientRect({ relativeTo: layer });
      const next = {
        l: Math.max(0, -box.x),
        t: Math.max(0, -box.y),
        r: Math.max(0, box.x + box.width - POST_W),
        b: Math.max(0, box.y + box.height - POST_H),
      };
      setOverhang((prev) =>
        Math.abs(prev.l - next.l) < 1 &&
        Math.abs(prev.t - next.t) < 1 &&
        Math.abs(prev.r - next.r) < 1 &&
        Math.abs(prev.b - next.b) < 1
          ? prev
          : next
      );
    };
    measure(0);
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

  const handleDragEndSnap = () => {
    setGuides({ v: false, h: false });
  };

  const editingElement = doc.elements.find(
    (e): e is TextEl => e.id === editingId && e.kind === 'text'
  );

  return (
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
          // Margens = espaço físico do pad do palco: tudo que o palco estende
          // além da folha vira área de rolagem alcançável (alças visíveis e
          // clicáveis mesmo quando o elemento estoura a folha)
          margin: `${padT}px ${padR}px ${padB}px ${padL}px`,
        }}
      >
        {/* Fitinha adesiva decorativa grudada na folha */}
        <div className={styles.washiTape} />
        <Stage
          ref={stageRef}
          width={displayWidth + padL + padR}
          height={displayHeight + padT + padB}
          x={padL}
          y={padT}
          scaleX={scaleRatio}
          scaleY={scaleRatio}
          style={{ position: 'relative', left: -padL, top: -padT }}
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

            {/* Acabamento do post (passo 5: papel + grain) */}
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

            {/* Transformer do Konva para rotação e redimensionamento */}
            <Transformer
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

      {/* Editor de texto in-place ao dar duplo clique (estilo Photoshop) */}
      {editingElement && (
        <InlineTextEditor
          element={editingElement}
          boxW={editBox?.w ?? null}
          boxH={editBox?.h ?? null}
          scaleRatio={scaleRatio}
          stageRect={(() => {
            const r = stageRef.current?.container()?.getBoundingClientRect();
            // O contêiner começa padL/padT px antes da folha; devolve a origem
            // da folha (origem do mundo do palco) já em coordenadas de tela.
            return r ? { left: r.left + padL, top: r.top + padT } : null;
          })()}
          onClose={closeEditing}
        />
      )}
    </div>
  );
});

EditorCanvas.displayName = 'EditorCanvas';

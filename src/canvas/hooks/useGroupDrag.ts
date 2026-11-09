import { useRef } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';
import { unionBox, type ElPatch } from '../../lib/multiSelect';
import { useEditor } from '../../store/editorStore';
import type { Box } from '../../types';

/** O mesmo arredondamento privado usado em multiSelect.ts e no EditorCanvas. */
const round2 = (n: number) => Math.round(n * 100) / 100;

interface GroupDrag {
  leaderId: string;
  /** Caixa (coords do post) que engloba o conjunto no início do arraste. */
  startBox: Box;
  leaderStart: { x: number; y: number };
  /** Posição inicial (local = coords do post) de cada nó do conjunto. */
  starts: Map<string, { x: number; y: number }>;
}

export interface GroupDragApi {
  begin: (node: Konva.Node) => void;
  end: () => void;
  active: () => boolean;
}

/**
 * Arraste em conjunto (seleção múltipla): registra a caixa da UNIÃO no início
 * do arraste e, no fim, comita UM passo de undo no doc com todos os patches.
 * O hook expõe `groupDragRef` porque o snap durante o arraste
 * (`handleDragMoveSnap` no EditorCanvas) depende dele junto de layoutGuides.
 */
export function useGroupDrag(
  stageRef: RefObject<Konva.Stage | null>,
  layerRef: RefObject<Konva.Layer | null>,
  applyPatches: (patches: ElPatch[]) => void,
  setGuides: (g: { v: boolean; h: boolean }) => void,
) {
  const groupDragRef = useRef<GroupDrag | null>(null);
  // Arraste em conjunto (início/fim) acessível à ponte de eventos (deps [])
  const groupApiRef = useRef<GroupDragApi>({ begin: () => {}, end: () => {}, active: () => false });

  /** Início de um arraste: se o nó pertence a uma seleção múltipla, registra o conjunto. */
  const beginGroupDrag = (node: Konva.Node) => {
    groupDragRef.current = null;
    const stage = stageRef.current;
    const layer = layerRef.current;
    const ids = useEditor.getState().selectedIds;
    if (!stage || !layer || ids.length < 2 || !ids.includes(String(node.id()))) return;
    const nodes = ids.map((id) => stage.findOne(`#${id}`)).filter((n): n is Konva.Node => !!n);
    if (nodes.length < 2) return;
    const startBox = unionBox(nodes.map((n) => n.getClientRect({ relativeTo: layer })));
    if (!startBox) return;
    groupDragRef.current = {
      leaderId: String(node.id()),
      startBox,
      leaderStart: { x: node.x(), y: node.y() },
      starts: new Map(nodes.map((n) => [String(n.id()), { x: n.x(), y: n.y() }])),
    };
  };

  /** Fim do arraste em conjunto: UM commit no doc (um passo de undo). */
  const endGroupDrag = () => {
    const g = groupDragRef.current;
    if (!g) return;
    const stage = stageRef.current;
    const patches = [...g.starts.keys()].flatMap((id) => {
      const n = stage?.findOne(`#${id}`);
      return n ? [{ id, patch: { x: round2(n.x()), y: round2(n.y()) } }] : [];
    });
    applyPatches(patches);
    groupDragRef.current = null;
    setGuides({ v: false, h: false });
  };

  groupApiRef.current = { begin: beginGroupDrag, end: endGroupDrag, active: () => !!groupDragRef.current };

  return { groupDragRef, groupApiRef, beginGroupDrag, endGroupDrag };
}

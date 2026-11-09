import type { ComponentProps, ComponentType } from 'react';
import Konva from 'konva';
import { Transformer } from 'react-konva';

/**
 * Espelho do Konva Transformer num **palco overlay** separado (veja o JSX do
 * EditorCanvas): um canvas irmão do palco principal, alinhado por CSS à
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
 * O patch abaixo soma o deslocamento (slack) do overlay na coordenada local
 * do Transformer, pois o canvas do overlay nasce fora da origem visual do
 * canvas principal. Eventos do overlay que não acertam uma âncora são
 * repostos ("bridge") no palco principal para seleção/arraste/duplo
 * clique/pan continuarem iguais.
 */

/** Versão do patch do espelho no protótipo (incrementar a cada mudança de
 * lógica). O carimbo permite reaplicar de forma idempotente sob HMR. */
export const MIRROR_PATCH_VERSION = 2;

export type MirrorHost = Konva.Transformer & {
  _mirrorSlackX?: number;
  _mirrorSlackY?: number;
  __mirrorPatchVersion?: number;
};

/** getTransform do espelho: soma a folga à coluna de translação em CÓPIA (o
 * Transform do Konva é cacheado — nunca mutar). Isso alinha o DESENHO das
 * alças: o Konva Transformer desenha em px crus do canvas do seu palco, e o
 * canvas do overlay nasce deslocado (folga) em relação ao canvas principal. */
export const mirrorGetTransform = (
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
export const mirrorFitNodesInto = (
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
/** Protótipo com a base do patch exposta, para reaplicação por instância sob HMR. */
export { transformerProto };
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
// para poder usá-la como <MirrorTransformerEl /> no JSX. O comportamento do
// espelho vive no patch da base acima; a subclasse só troca o proxy de arraste.
(Konva as unknown as Record<string, unknown>).MirrorTransformer =
  class MirrorTransformer extends Konva.Transformer {
    /**
     * Seleção múltipla: o proxy original do Konva dá `startDrag` em cada nó
     * seguidor, e cada um passaria a rodar o snap sozinho (o conjunto se
     * deformaria). Aqui só o líder é arrastado de fato; o EditorCanvas faz o
     * snap pela caixa da UNIÃO e posiciona os seguidores (ver handleDragMoveSnap).
     * Com 1 nó o resultado é idêntico ao original (só `startDrag` do Transformer).
     */
    _proxyDrag(node: Konva.Node) {
      node.on(`dragstart.${this._getEventNamespace()}`, (e) => {
        if (!this.isDragging() && node !== this.findOne('.back')) {
          this.startDrag(e, false);
        }
      });
    }
  };
// Tag "host" do react-konva para a subclasse registrada acima — tipagem
// reaproveita as props do Transformer padrão para o JSX checar tudo.
export const MirrorTransformerEl = 'MirrorTransformer' as unknown as ComponentType<
  ComponentProps<typeof Transformer>
>;

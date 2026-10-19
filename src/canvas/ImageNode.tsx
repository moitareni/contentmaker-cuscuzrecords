import React, { useRef } from 'react';
import { Group as KonvaGroup, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { useImage } from '../lib/useImage';
import { useUserImage } from '../lib/userImages';
import type { ImageEl } from '../types';

export interface ImageNodeProps {
  element: ImageEl;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ImageEl>) => void;
  onDragMoveSnap: (node: Konva.Node) => void;
  onDragEndSnap: () => void;
}

/**
 * Imagem do usuário no canvas.
 *
 * Mesmo padrão do DecorationNode: o nó anexado ao Transformer é um `Group`
 * SEMPRE com escala positiva; o espelhamento (flipX/flipY) vive só na `Image`
 * interna, vindo do store — escala negativa no próprio nó faria o Konva
 * converter o flip em rotação de 180° no meio do resize.
 *
 * O Group nasce com `imageId` em userData para o export esperar o load.
 */
export const ImageNode: React.FC<ImageNodeProps> = ({
  element,
  onChange,
  onDragEndSnap,
  onDragMoveSnap,
  onSelect,
}) => {
  const groupRef = useRef<Konva.Group>(null);
  const entry = useUserImage(element.imageId);
  const [image] = useImage(entry?.url);

  if (!entry || !image) return null;

  const { width, height } = element;

  return (
    <KonvaGroup
      ref={groupRef}
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      scaleX={element.scale}
      scaleY={element.scale}
      draggable
      data={{ userImageId: element.imageId }}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => {
        onDragMoveSnap(e.target);
      }}
      onDragEnd={(e) => {
        onDragEndSnap();
        onChange({
          x: e.target.x(),
          y: e.target.y(),
        });
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        // A escala do Grupo é sempre positiva; flip é só da Image interna.
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: Math.round(node.rotation()),
          scale: Math.abs(node.scaleX()),
        });
      }}
    >
      <KonvaImage
        image={image}
        width={width}
        height={height}
        offsetX={width / 2}
        offsetY={height / 2}
        scaleX={element.flipX ? -1 : 1}
        scaleY={element.flipY ? -1 : 1}
      />
    </KonvaGroup>
  );
};

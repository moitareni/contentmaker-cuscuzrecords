import React, { useRef } from 'react';
import { Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { getLogo } from '../assets';
import { useImage } from '../lib/useImage';
import type { LogoEl } from '../types';

export interface LogoNodeProps {
  element: LogoEl;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<LogoEl>) => void;
  onDragMoveSnap: (node: Konva.Node) => void;
  onDragEndSnap: () => void;
}

export const LogoNode: React.FC<LogoNodeProps> = ({
  element,
  onSelect,
  onChange,
  onDragMoveSnap,
  onDragEndSnap,
}) => {
  const imageRef = useRef<Konva.Image>(null);
  const asset = getLogo(element.variant);
  const [image] = useImage(asset?.src);

  if (!asset || !image) return null;

  const width = asset.width;
  const height = asset.height;

  return (
    <KonvaImage
      ref={imageRef}
      id={element.id}
      image={image}
      x={element.x}
      y={element.y}
      width={width}
      height={height}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={element.rotation}
      scaleX={element.scale}
      scaleY={element.scale}
      draggable
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
        const node = imageRef.current;
        if (!node) return;
        // Sem flip persistido no store: se o arrasto cruzou o eixo (escala
        // negativa), normalizamos para magnitude positiva aqui mesmo.
        const sx = node.scaleX();
        const sy = node.scaleY();
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: Math.round(node.rotation()),
          scale: Math.max(Math.abs(sx), Math.abs(sy)),
        });
      }}
    />
  );
};

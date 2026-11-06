import React, { useEffect, useRef } from 'react';
import { Group, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { getBackground } from '../assets';
import { POST_H, POST_W, type PostFormat } from '../brand/brand';
import { useImage } from '../lib/useImage';

export interface BackgroundNodeProps {
  backgroundId: string | null;
  flipX?: boolean;
  flipY?: boolean;
  format?: PostFormat;
  offsetY?: number;
  isInteractive?: boolean;
  onOffsetYChange?: (offsetY: number) => void;
}

export const BackgroundNode: React.FC<BackgroundNodeProps> = ({
  backgroundId,
  flipX = false,
  flipY = false,
  format = '3:4',
  offsetY = 180,
  isInteractive = false,
  onOffsetYChange,
}) => {
  const asset = getBackground(backgroundId);
  const [image] = useImage(asset?.src);
  const imageRef = useRef<Konva.Image>(null);

  // Mantém posição sincronizada quando o slider ou preset altera offsetY
  useEffect(() => {
    if (format === '1:1' && imageRef.current) {
      imageRef.current.y(720 - offsetY);
      imageRef.current.x(POST_W / 2);
    }
  }, [format, offsetY]);

  if (!image) return null;

  // 1. Formato 4:3 (Horizontal: 1440 × 1080)
  if (format === '4:3') {
    return (
      <Group
        x={1440 / 2}
        y={1080 / 2}
        scaleX={flipX ? -1 : 1}
        scaleY={flipY ? -1 : 1}
        listening={false}
      >
        <KonvaImage
          image={image}
          x={0}
          y={0}
          offsetX={POST_W / 2}
          offsetY={POST_H / 2}
          width={POST_W}
          height={POST_H}
          rotation={90}
          listening={false}
          perfectDrawEnabled={false}
        />
      </Group>
    );
  }

  // 2. Formato 1:1 (Quadrado: 1080 × 1080 com corte vertical deslizável)
  if (format === '1:1') {
    const clampedOffset = Math.min(360, Math.max(0, offsetY));
    const targetY = 720 - clampedOffset;

    return (
      <KonvaImage
        ref={imageRef}
        image={image}
        x={POST_W / 2}
        y={targetY}
        offsetX={POST_W / 2}
        offsetY={POST_H / 2}
        width={POST_W}
        height={POST_H}
        scaleX={flipX ? -1 : 1}
        scaleY={flipY ? -1 : 1}
        draggable={isInteractive}
        listening={isInteractive}
        perfectDrawEnabled={false}
        onMouseEnter={(e) => {
          if (!isInteractive) return;
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'grab';
        }}
        onMouseLeave={(e) => {
          if (!isInteractive) return;
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'default';
        }}
        onDragStart={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'grabbing';
        }}
        onDragMove={(e) => {
          if (!isInteractive) return;
          e.target.x(POST_W / 2);
          const curY = e.target.y();
          const clampedY = Math.min(720, Math.max(360, curY));
          e.target.y(clampedY);
          const nextOffset = Math.round(720 - clampedY);
          onOffsetYChange?.(nextOffset);
        }}
        onDragEnd={(e) => {
          if (!isInteractive) return;
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'grab';
          e.target.x(POST_W / 2);
          const curY = e.target.y();
          const clampedY = Math.min(720, Math.max(360, curY));
          e.target.y(clampedY);
          const nextOffset = Math.round(720 - clampedY);
          onOffsetYChange?.(nextOffset);
        }}
      />
    );
  }

  // 3. Formato 3:4 padrão (Vertical: 1080 × 1440)
  return (
    <KonvaImage
      image={image}
      x={POST_W / 2}
      y={POST_H / 2}
      offsetX={POST_W / 2}
      offsetY={POST_H / 2}
      width={POST_W}
      height={POST_H}
      scaleX={flipX ? -1 : 1}
      scaleY={flipY ? -1 : 1}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};

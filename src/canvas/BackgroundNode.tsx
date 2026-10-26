import React from 'react';
import { Image as KonvaImage } from 'react-konva';
import { getBackground } from '../assets';
import { POST_H, POST_W } from '../brand/brand';
import { useImage } from '../lib/useImage';

export interface BackgroundNodeProps {
  backgroundId: string | null;
  flipX?: boolean;
  flipY?: boolean;
}

export const BackgroundNode: React.FC<BackgroundNodeProps> = ({
  backgroundId,
  flipX = false,
  flipY = false,
}) => {
  const asset = getBackground(backgroundId);
  const [image] = useImage(asset?.src);

  if (!image) return null;

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

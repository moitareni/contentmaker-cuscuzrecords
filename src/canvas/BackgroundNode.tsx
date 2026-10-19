import React from 'react';
import { Image as KonvaImage } from 'react-konva';
import { getBackground } from '../assets';
import { POST_H, POST_W } from '../brand/brand';
import { useImage } from '../lib/useImage';

export interface BackgroundNodeProps {
  backgroundId: string | null;
}

export const BackgroundNode: React.FC<BackgroundNodeProps> = ({ backgroundId }) => {
  const asset = getBackground(backgroundId);
  const [image] = useImage(asset?.src);

  if (!image) return null;

  return (
    <KonvaImage
      image={image}
      x={0}
      y={0}
      width={POST_W}
      height={POST_H}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};

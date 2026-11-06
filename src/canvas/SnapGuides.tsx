import React from 'react';
import { Line } from 'react-konva';
import { COLORS, POST_H, POST_W } from '../brand/brand';

export interface SnapGuidesProps {
  v: boolean;
  h: boolean;
  postWidth?: number;
  postHeight?: number;
}

export const SnapGuides: React.FC<SnapGuidesProps> = ({
  v,
  h,
  postWidth = POST_W,
  postHeight = POST_H,
}) => {
  return (
    <>
      {/* Guia vertical central */}
      {v && (
        <Line
          points={[postWidth / 2, 0, postWidth / 2, postHeight]}
          stroke={COLORS.verde}
          strokeWidth={3}
          dash={[8, 8]}
          listening={false}
        />
      )}

      {/* Guia horizontal central */}
      {h && (
        <Line
          points={[0, postHeight / 2, postWidth, postHeight / 2]}
          stroke={COLORS.verde}
          strokeWidth={3}
          dash={[8, 8]}
          listening={false}
        />
      )}
    </>
  );
};

import React from 'react';
import { Line } from 'react-konva';
import { COLORS, POST_H, POST_W } from '../brand/brand';

export interface SnapGuidesProps {
  v: boolean;
  h: boolean;
}

export const SnapGuides: React.FC<SnapGuidesProps> = ({ v, h }) => {
  return (
    <>
      {/* Guia vertical central (x = 540) */}
      {v && (
        <Line
          points={[POST_W / 2, 0, POST_W / 2, POST_H]}
          stroke={COLORS.verde}
          strokeWidth={3}
          dash={[8, 8]}
          listening={false}
        />
      )}

      {/* Guia horizontal central (y = 720) */}
      {h && (
        <Line
          points={[0, POST_H / 2, POST_W, POST_H / 2]}
          stroke={COLORS.verde}
          strokeWidth={3}
          dash={[8, 8]}
          listening={false}
        />
      )}
    </>
  );
};

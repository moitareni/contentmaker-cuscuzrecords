import React from 'react';
import { Line, Rect } from 'react-konva';
import { GUIDE_COLORS, POST_H, POST_W } from '../brand/brand';

export interface LayoutGuidesProps {
  margin: number;
  showMargins: boolean;
  showCenters: boolean;
  showThirds: boolean;
  postWidth?: number;
  postHeight?: number;
}

/**
 * Guias de layout estilo Photoshop: margens de segurança + cruz central
 * + terços. Apenas ajuda visual — nunca entra no export (App esconde
 * antes do toDataURL) e nunca intercepta eventos (listening=false).
 */
export const LayoutGuides: React.FC<LayoutGuidesProps> = ({
  margin,
  showMargins,
  showCenters,
  showThirds,
  postWidth = POST_W,
  postHeight = POST_H,
}) => {
  return (
    <>
      {/* Margens de segurança */}
      {showMargins && margin > 0 && (
        <Rect
          x={margin}
          y={margin}
          width={postWidth - margin * 2}
          height={postHeight - margin * 2}
          stroke={GUIDE_COLORS.margin}
          strokeWidth={3}
          dash={[10, 8]}
          listening={false}
        />
      )}

      {/* Cruz central */}
      {showCenters && (
        <>
          <Line
            points={[postWidth / 2, 0, postWidth / 2, postHeight]}
            stroke={GUIDE_COLORS.center}
            strokeWidth={3}
            dash={[8, 8]}
            listening={false}
          />
          <Line
            points={[0, postHeight / 2, postWidth, postHeight / 2]}
            stroke={GUIDE_COLORS.center}
            strokeWidth={3}
            dash={[8, 8]}
            listening={false}
          />
        </>
      )}

      {/* Terços (regra dos terços) */}
      {showThirds && (
        <>
          <Line
            points={[postWidth / 3, 0, postWidth / 3, postHeight]}
            stroke={GUIDE_COLORS.third}
            strokeWidth={2}
            dash={[4, 6]}
            opacity={0.45}
            listening={false}
          />
          <Line
            points={[(2 * postWidth) / 3, 0, (2 * postWidth) / 3, postHeight]}
            stroke={GUIDE_COLORS.third}
            strokeWidth={2}
            dash={[4, 6]}
            opacity={0.45}
            listening={false}
          />
          <Line
            points={[0, postHeight / 3, postWidth, postHeight / 3]}
            stroke={GUIDE_COLORS.third}
            strokeWidth={2}
            dash={[4, 6]}
            opacity={0.45}
            listening={false}
          />
          <Line
            points={[0, (2 * postHeight) / 3, postWidth, (2 * postHeight) / 3]}
            stroke={GUIDE_COLORS.third}
            strokeWidth={2}
            dash={[4, 6]}
            opacity={0.45}
            listening={false}
          />
        </>
      )}
    </>
  );
};

import React from 'react';
import { Line, Rect } from 'react-konva';
import { GUIDE_COLORS, POST_H, POST_W } from '../brand/brand';

export interface LayoutGuidesProps {
  margin: number;
  showMargins: boolean;
  showCenters: boolean;
  showThirds: boolean;
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
}) => {
  return (
    <>
      {/* Margens de segurança */}
      {showMargins && margin > 0 && (
        <Rect
          x={margin}
          y={margin}
          width={POST_W - margin * 2}
          height={POST_H - margin * 2}
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
            points={[POST_W / 2, 0, POST_W / 2, POST_H]}
            stroke={GUIDE_COLORS.center}
            strokeWidth={3}
            dash={[8, 8]}
            listening={false}
          />
          <Line
            points={[0, POST_H / 2, POST_W, POST_H / 2]}
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
            points={[POST_W / 3, 0, POST_W / 3, POST_H]}
            stroke={GUIDE_COLORS.third}
            strokeWidth={2}
            dash={[4, 6]}
            opacity={0.45}
            listening={false}
          />
          <Line
            points={[(2 * POST_W) / 3, 0, (2 * POST_W) / 3, POST_H]}
            stroke={GUIDE_COLORS.third}
            strokeWidth={2}
            dash={[4, 6]}
            opacity={0.45}
            listening={false}
          />
          <Line
            points={[0, POST_H / 3, POST_W, POST_H / 3]}
            stroke={GUIDE_COLORS.third}
            strokeWidth={2}
            dash={[4, 6]}
            opacity={0.45}
            listening={false}
          />
          <Line
            points={[0, (2 * POST_H) / 3, POST_W, (2 * POST_H) / 3]}
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

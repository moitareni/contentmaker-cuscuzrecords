import React, { useMemo } from 'react';
import { Image as KonvaImage, Rect } from 'react-konva';
import { GRAIN_SEED, GRAIN_SIZES, GRAIN_TILE_SIZE, POST_H, POST_W } from '../brand/brand';
import { getPaperTexture } from '../assets';
import { makeGrainTile } from '../lib/grain';
import { useImage } from '../lib/useImage';
import type { FinishState } from '../types';

export interface TextureOverlaysProps {
  finish: FinishState;
}

/**
 * Acabamento do post (passo 6): papel amassado em multiply + grain
 * monocromático em overlay, cobrindo a folha inteira.
 * Nunca intercepta eventos nem entra na seleção — e entra no export
 * porque vive dentro do Layer (diferente das guias, que se escondem).
 */
export const TextureOverlays: React.FC<TextureOverlaysProps> = ({ finish }) => {
  const paper = getPaperTexture();
  const [paperImage] = useImage(paper?.src);
  // Mesmo tile com seed fixa no preview e no export: grão idêntico.
  const grainTile = useMemo(() => makeGrainTile(GRAIN_TILE_SIZE, GRAIN_SEED), []);
  const patternScale = GRAIN_SIZES[finish.grain.size]?.patternScale ?? 1;

  return (
    <>
      {/* Papel amassado (textura clara: overlay realça os vincos) */}
      {finish.paper.enabled && paperImage && (
        <KonvaImage
          image={paperImage}
          x={0}
          y={0}
          width={POST_W}
          height={POST_H}
          globalCompositeOperation="overlay"
          opacity={finish.paper.opacity / 100}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {/* Granulado monocromático */}
      {finish.grain.enabled && grainTile && (
        <Rect
          x={0}
          y={0}
          width={POST_W}
          height={POST_H}
          fillPatternImage={
            // Konva aceita canvas em runtime; o tipo declara só HTMLImageElement
            grainTile as unknown as HTMLImageElement
          }
          fillPatternRepeat="repeat"
          fillPatternScaleX={patternScale}
          fillPatternScaleY={patternScale}
          globalCompositeOperation="overlay"
          opacity={finish.grain.intensity / 100}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </>
  );
};

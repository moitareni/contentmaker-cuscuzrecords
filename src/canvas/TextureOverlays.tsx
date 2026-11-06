import React, { useMemo } from 'react';
import { Image as KonvaImage, Rect } from 'react-konva';
import { GRAIN_SEED, GRAIN_SIZES, GRAIN_TILE_SIZE, POST_H, POST_W, type PostFormat } from '../brand/brand';
import { getBorderTexture, getPaperTexture } from '../assets';
import { makeGrainTile } from '../lib/grain';
import { useImage } from '../lib/useImage';
import type { FinishState } from '../types';

export interface TextureOverlaysProps {
  finish: FinishState;
  format?: PostFormat;
  postWidth?: number;
  postHeight?: number;
}

/**
 * Acabamento do post (passo 6): papel amassado + textura de borda em overlay
 * + grain monocromático em overlay, cobrindo a folha inteira.
 * Nunca intercepta eventos nem entra na seleção — e entra no export
 * porque vive dentro do Layer (diferente das guias, que se escondem).
 */
export const TextureOverlays: React.FC<TextureOverlaysProps> = ({
  finish,
  format = '3:4',
  postWidth = POST_W,
  postHeight = POST_H,
}) => {
  const paper = getPaperTexture();
  const [paperImage] = useImage(paper?.src);
  const border = getBorderTexture();
  const [borderImage] = useImage(border?.src);
  // Mesmo tile com seed fixa no preview e no export: grão idêntico.
  const grainTile = useMemo(() => makeGrainTile(GRAIN_TILE_SIZE, GRAIN_SEED), []);
  const patternScale = GRAIN_SIZES[finish.grain.size]?.patternScale ?? 1;

  const textureProps = useMemo(() => {
    if (format === '4:3') {
      return {
        x: postWidth / 2,
        y: postHeight / 2,
        offsetX: POST_W / 2,
        offsetY: POST_H / 2,
        width: POST_W,
        height: POST_H,
        rotation: 90,
      };
    }
    if (format === '1:1') {
      return {
        x: postWidth / 2,
        y: postHeight / 2,
        offsetX: POST_W / 2,
        offsetY: POST_H / 2,
        width: POST_W,
        height: POST_H,
        rotation: 0,
      };
    }
    return {
      x: 0,
      y: 0,
      offsetX: 0,
      offsetY: 0,
      width: POST_W,
      height: POST_H,
      rotation: 0,
    };
  }, [format, postWidth, postHeight]);

  return (
    <>
      {/* Papel amassado (textura clara: overlay realça os vincos) */}
      {finish.paper.enabled && paperImage && (
        <KonvaImage
          image={paperImage}
          {...textureProps}
          globalCompositeOperation="overlay"
          opacity={finish.paper.opacity / 100}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {/* Textura de borda (BORDER/TEXTURA-BORDA em overlay) */}
      {finish.borderTexture?.enabled && borderImage && (
        <KonvaImage
          image={borderImage}
          {...textureProps}
          globalCompositeOperation="overlay"
          opacity={finish.borderTexture.opacity / 100}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {/* Granulado monocromático */}
      {finish.grain.enabled && grainTile && (
        <Rect
          x={0}
          y={0}
          width={postWidth}
          height={postHeight}
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

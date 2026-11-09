import React, { useEffect, useRef } from 'react';
import { Group, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import { canvasBlendOf, getDecoration, getLogo, manifest } from '../assets';
import {
  BORDER_PAD,
  BORDERS,
  BRAND_EFFECT,
  COLORS,
  FONT_BODY,
  FONT_HEADLINE,
} from '../brand/brand';
import { useImage } from '../lib/useImage';
import { useUserImage } from '../lib/userImages';
import type { DecorationEl, El, ImageEl, LogoEl, TextEl } from '../types';

export interface CrossoverMirrorNodeProps {
  element: El;
  /**
   * Deslocamento horizontal em px do post:
   * - `-postWidth` quando o elemento vem do slide anterior (entra pela borda esquerda)
   * - `+postWidth` quando o elemento vem do slide seguinte (entra pela borda direita)
   */
  offsetX: number;
  listening?: boolean;
}

const ContinuationDecoration: React.FC<{ element: DecorationEl; offsetX: number }> = ({
  element,
  offsetX,
}) => {
  const asset = getDecoration(element.assetId);
  const [image] = useImage(asset?.src);
  if (!asset || !image) return null;

  const { width, height } = asset;
  const blendOp = canvasBlendOf(asset.blend);

  return (
    <Group
      x={element.x + offsetX}
      y={element.y}
      rotation={element.rotation}
      scaleX={element.scale}
      scaleY={element.scale}
      listening={false}
    >
      <KonvaImage
        image={image}
        width={width}
        height={height}
        offsetX={width / 2}
        offsetY={height / 2}
        scaleX={element.flipX ? -1 : 1}
        scaleY={element.flipY ? -1 : 1}
        globalCompositeOperation={blendOp}
        listening={false}
      />
    </Group>
  );
};

const ContinuationLogo: React.FC<{ element: LogoEl; offsetX: number }> = ({
  element,
  offsetX,
}) => {
  const asset = getLogo(element.variant);
  const [image] = useImage(asset?.src);
  if (!asset || !image) return null;

  const { width, height } = asset;

  return (
    <KonvaImage
      image={image}
      x={element.x + offsetX}
      y={element.y}
      width={width}
      height={height}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={element.rotation}
      scaleX={element.scale}
      scaleY={element.scale}
      listening={false}
    />
  );
};

const ContinuationImage: React.FC<{ element: ImageEl; offsetX: number }> = ({
  element,
  offsetX,
}) => {
  const entry = useUserImage(element.imageId);
  const [image] = useImage(entry?.url);
  if (!entry || !image) return null;

  const { width, height } = element;

  return (
    <Group
      x={element.x + offsetX}
      y={element.y}
      rotation={element.rotation}
      scaleX={element.scale}
      scaleY={element.scale}
      data={{ userImageId: element.imageId }}
      listening={false}
    >
      <KonvaImage
        image={image}
        width={width}
        height={height}
        offsetX={width / 2}
        offsetY={height / 2}
        scaleX={element.flipX ? -1 : 1}
        scaleY={element.flipY ? -1 : 1}
        listening={false}
      />
    </Group>
  );
};

const ContinuationText: React.FC<{ element: TextEl; offsetX: number }> = ({
  element,
  offsetX,
}) => {
  const groupRef = useRef<Konva.Group>(null);
  const textMeasurerRef = useRef<Konva.Text>(null);
  const [texture] = useImage(manifest.borderTexture.src);

  const isHeadline = element.style !== 'body';
  const fontFamily = isHeadline ? FONT_HEADLINE : FONT_BODY;
  const fontWeight = isHeadline ? '900' : 'bold';
  const rawText = element.text || ' ';
  const displayText = element.uppercase ? rawText.toUpperCase() : rawText;
  const { fontSize, lineHeight, letterSpacing, align } = element;
  const padX = element.border !== 'none' ? fontSize * BORDER_PAD.x : 0;
  const padY = element.border !== 'none' ? fontSize * BORDER_PAD.y : 0;

  useEffect(() => {
    const textNode = textMeasurerRef.current;
    const groupNode = groupRef.current;
    if (!textNode || !groupNode) return;
    const width = textNode.width() + padX * 2;
    const height = textNode.height() + padY * 2;
    groupNode.offsetX(width / 2);
    groupNode.offsetY(height / 2);
  }, [displayText, fontSize, lineHeight, letterSpacing, padX, padY, element.border]);

  const hasBorder = element.border !== 'none';
  const borderConfig = hasBorder ? BORDERS[element.border as keyof typeof BORDERS] : null;
  const textColor = COLORS[element.color as keyof typeof COLORS] ?? COLORS.preto;

  return (
    <Group
      ref={groupRef}
      x={element.x + offsetX}
      y={element.y}
      rotation={element.rotation}
      scaleX={1}
      scaleY={1}
      listening={false}
    >
      {hasBorder && borderConfig && (
        <Group
          clipFunc={(ctx) => {
            const t = textMeasurerRef.current;
            const w = (t ? t.width() : 100) + padX * 2;
            const h = (t ? t.height() : 50) + padY * 2;
            ctx.rect(0, 0, w, h);
          }}
          listening={false}
        >
          <Rect
            x={0}
            y={0}
            width={textMeasurerRef.current ? textMeasurerRef.current.width() + padX * 2 : 100}
            height={textMeasurerRef.current ? textMeasurerRef.current.height() + padY * 2 : 50}
            fill={borderConfig.color}
            listening={false}
          />
          {texture && (
            <KonvaImage
              image={texture}
              x={0}
              y={0}
              width={textMeasurerRef.current ? textMeasurerRef.current.width() + padX * 2 : 100}
              height={textMeasurerRef.current ? textMeasurerRef.current.height() + padY * 2 : 50}
              globalCompositeOperation="soft-light"
              opacity={borderConfig.textureOpacity}
              listening={false}
            />
          )}
        </Group>
      )}
      {element.brandEffect && (
        <KonvaText
          text={displayText}
          x={padX}
          y={padY}
          fontFamily={fontFamily}
          fontStyle={fontWeight}
          fontSize={fontSize}
          lineHeight={lineHeight}
          letterSpacing={letterSpacing}
          align={align}
          fill={BRAND_EFFECT.strokeColor}
          stroke={BRAND_EFFECT.strokeColor}
          strokeWidth={BRAND_EFFECT.strokeOutside * 2}
          shadowColor={BRAND_EFFECT.shadowColor}
          shadowOpacity={BRAND_EFFECT.shadowOpacity}
          shadowOffsetY={BRAND_EFFECT.shadowDistance}
          shadowOffsetX={0}
          shadowBlur={BRAND_EFFECT.shadowBlur}
          listening={false}
        />
      )}
      <KonvaText
        ref={textMeasurerRef}
        text={displayText}
        x={padX}
        y={padY}
        fontFamily={fontFamily}
        fontStyle={fontWeight}
        fontSize={fontSize}
        lineHeight={lineHeight}
        letterSpacing={letterSpacing}
        align={align}
        fill={textColor}
        listening={false}
      />
    </Group>
  );
};

/**
 * Continuação Visual somente leitura de um Elemento Crossover de um slide adjacente
 * (anterior com offsetX = -postWidth, ou seguinte com offsetX = +postWidth).
 * Renderizado com opacidade 100% (opacity: 1) e mesma orientação do original.
 */
export const CrossoverMirrorNode: React.FC<CrossoverMirrorNodeProps> = ({
  element,
  offsetX,
}) => {
  if (element.kind === 'decoration') {
    return <ContinuationDecoration element={element} offsetX={offsetX} />;
  }
  if (element.kind === 'logo') {
    return <ContinuationLogo element={element} offsetX={offsetX} />;
  }
  if (element.kind === 'image') {
    return <ContinuationImage element={element} offsetX={offsetX} />;
  }
  if (element.kind === 'text') {
    return <ContinuationText element={element} offsetX={offsetX} />;
  }
  return null;
};

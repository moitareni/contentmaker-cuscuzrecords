import React, { useEffect, useRef } from 'react';
import { Group, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import { manifest } from '../assets';
import {
  BORDER_PAD,
  BORDERS,
  BRAND_EFFECT,
  COLORS,
  FONT_BODY,
  FONT_HEADLINE,
} from '../brand/brand';
import { useImage } from '../lib/useImage';
import type { TextEl } from '../types';

export interface TextNodeProps {
  element: TextEl;
  isSelected: boolean;
  /** Quando true, esconde as camadas de texto (o overlay in-place assume). */
  isEditing?: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
  onChange: (patch: Partial<TextEl>) => void;
  onApplyTextSize: (requested: number) => number;
  /** Reporta a caixa total (texto + pads) em px do post para o editor in-place. */
  onMeasure?: (w: number, h: number) => void;
  onDragMoveSnap: (node: Konva.Node) => void;
  onDragEndSnap: () => void;
}

export const TextNode: React.FC<TextNodeProps> = ({
  element,
  isEditing = false,
  onSelect,
  onDoubleClick,
  onChange,
  onApplyTextSize,
  onMeasure,
  onDragMoveSnap,
  onDragEndSnap,
}) => {
  const groupRef = useRef<Konva.Group>(null);
  const textMeasurerRef = useRef<Konva.Text>(null);
  const [texture] = useImage(manifest.borderTexture.src);

  const isHeadline = element.style !== 'body';
  const fontFamily = isHeadline ? FONT_HEADLINE : FONT_BODY;
  const fontWeight = isHeadline ? '900' : 'bold';

  const rawText = element.text || ' ';
  const displayText = element.uppercase ? rawText.toUpperCase() : rawText;

  // Mede as dimensões do texto para posicionar o offset/borda e o centro do grupo
  const fontSize = element.fontSize;
  const lineHeight = element.lineHeight;
  const letterSpacing = element.letterSpacing;
  const align = element.align;

  const padX = element.border !== 'none' ? fontSize * BORDER_PAD.x : 0;
  const padY = element.border !== 'none' ? fontSize * BORDER_PAD.y : 0;

  // Recalcula o centro do grupo após mudanças de texto
  useEffect(() => {
    const textNode = textMeasurerRef.current;
    const groupNode = groupRef.current;
    if (!textNode || !groupNode) return;

    const width = textNode.width() + padX * 2;
    const height = textNode.height() + padY * 2;

    groupNode.offsetX(width / 2);
    groupNode.offsetY(height / 2);
    onMeasure?.(width, height);
  }, [displayText, fontSize, lineHeight, letterSpacing, padX, padY, element.border, onMeasure]);

  const hasBorder = element.border !== 'none';
  const borderConfig = hasBorder ? BORDERS[element.border as keyof typeof BORDERS] : null;

  const textColor = COLORS[element.color as keyof typeof COLORS] ?? COLORS.preto;

  return (
    <Group
      ref={groupRef}
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      scaleX={1}
      scaleY={1}
      draggable={!isEditing}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDoubleClick}
      onDblTap={onDoubleClick}
      onDragMove={(e) => {
        onDragMoveSnap(e.target);
      }}
      onDragEnd={(e) => {
        onDragEndSnap();
        onChange({
          x: e.target.x(),
          y: e.target.y(),
        });
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const currentSize = element.fontSize;
        const requestedSize = Math.round(currentSize * Math.abs(scaleX));

        // Reseta a escala do nó para 1 e atualiza via regra de tamanho de texto
        node.scaleX(1);
        node.scaleY(1);

        const appliedSize = onApplyTextSize(requestedSize);

        onChange({
          x: node.x(),
          y: node.y(),
          rotation: Math.round(node.rotation()),
          fontSize: appliedSize,
        });
      }}
    >
      {/* 1. Borda de Destaque com textura em modo 'soft-light' */}
      {hasBorder && borderConfig && (
        <Group
          clipFunc={(ctx) => {
            const t = textMeasurerRef.current;
            const w = (t ? t.width() : 100) + padX * 2;
            const h = (t ? t.height() : 50) + padY * 2;
            ctx.rect(0, 0, w, h);
          }}
        >
          {/* Fundo colorido da borda (Amarelo ou Barro) */}
          <Rect
            x={0}
            y={0}
            width={textMeasurerRef.current ? textMeasurerRef.current.width() + padX * 2 : 100}
            height={textMeasurerRef.current ? textMeasurerRef.current.height() + padY * 2 : 50}
            fill={borderConfig.color}
          />
          {/* Textura sobreposta em luz indireta (soft-light) */}
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

      {/* 2. Traçado externo e sombra projetada da identidade (Photoshop) */}
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
          strokeWidth={BRAND_EFFECT.strokeOutside * 2} // 4px stroke -> 2px visíveis externamente
          shadowColor={BRAND_EFFECT.shadowColor}
          shadowOpacity={BRAND_EFFECT.shadowOpacity}
          shadowOffsetY={BRAND_EFFECT.shadowDistance}
          shadowOffsetX={0}
          shadowBlur={BRAND_EFFECT.shadowBlur}
          listening={false}
          visible={!isEditing}
        />
      )}

      {/* 3. Texto principal preenchido (desenhado no topo para traçado 100% externo) */}
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
        visible={!isEditing}
      />
    </Group>
  );
};

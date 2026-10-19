import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Heading,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '../brand/brand';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ColorSwatches } from '../components/ui/ColorSwatches';
import { IconButton } from '../components/ui/IconButton';
import { Segmented } from '../components/ui/Segmented';
import { Slider } from '../components/ui/Slider';
import { textSizeLimits } from '../lib/textRules';
import { useEditor, useSelected } from '../store/editorStore';
import type { BorderKind, TextEl } from '../types';
import styles from './StepPanel.module.css';

export const TextStep: React.FC = () => {
  const addText = useEditor((s) => s.addText);
  const updateElement = useEditor((s) => s.updateElement);
  const removeElement = useEditor((s) => s.removeElement);
  const select = useEditor((s) => s.select);
  const elements = useEditor((s) => s.doc.elements);

  const selected = useSelected();
  const selectedText = selected && selected.kind === 'text' ? (selected as TextEl) : null;

  const currentTexts = elements.filter((e): e is TextEl => e.kind === 'text');

  // Calcula os limites de tamanho do texto selecionado para o slider
  const limits = selectedText
    ? textSizeLimits(elements, selectedText)
    : { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX, reason: 'absolute' as const };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>3. Escreve aí 📝</h2>
        <p className={styles.description}>
          Adicione títulos, textos ou caixas de destaque com as fontes e cores da identidade visual.
        </p>
      </div>

      {/* Botões de Adicionar Novos Textos */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Adicionar à folha</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Button
            variant="secondary"
            size="md"
            icon={<Heading size={18} strokeWidth={2.5} />}
            onClick={() => addText('title')}
          >
            + Título (Londrina Black)
          </Button>

          <Button
            variant="secondary"
            size="md"
            icon={<Type size={18} strokeWidth={2.5} />}
            onClick={() => addText('body')}
          >
            + Texto (PT Sans Narrow)
          </Button>

          <Button
            variant="secondary"
            size="md"
            icon={<Sparkles size={18} strokeWidth={2.5} />}
            onClick={() => addText('highlight')}
          >
            + Destaque (com efeito)
          </Button>
        </div>
      </div>

      {/* Edição do Texto Selecionado */}
      {selectedText && (
        <Card
          title="Editar Texto"
          action={
            <IconButton
              icon={<Trash2 size={16} strokeWidth={2.5} />}
              label="Excluir texto"
              variant="danger"
              size="sm"
              onClick={() => removeElement(selectedText.id)}
            />
          }
        >
          {/* Conteúdo do Texto */}
          <div className={styles.section}>
            <textarea
              value={selectedText.text}
              onChange={(e) => updateElement(selectedText.id, { text: e.target.value })}
              placeholder="Digite o texto aqui..."
              rows={3}
              className={styles.textarea}
            />
          </div>

          {/* Slider de Tamanho com marcador de limite e regra Texto <= Título */}
          <Slider
            label="Tamanho da Fonte"
            value={selectedText.fontSize}
            min={limits.min}
            max={limits.max}
            step={1}
            limitMarker={
              selectedText.style === 'body'
                ? { value: limits.max, label: 'Limite permitido pelo menor título' }
                : undefined
            }
            onChange={(val) => {
              updateElement(selectedText.id, { fontSize: val });
            }}
          />

          {/* Alinhamento Horizontal do Parágrafo */}
          <div className={styles.section}>
            <span style={{ fontSize: '15px', fontWeight: 700 }}>Alinhamento do Texto</span>
            <Segmented
              options={[
                { value: 'left', label: <AlignLeft size={16} strokeWidth={2.5} />, hint: 'À esquerda' },
                { value: 'center', label: <AlignCenter size={16} strokeWidth={2.5} />, hint: 'Centralizado' },
                { value: 'right', label: <AlignRight size={16} strokeWidth={2.5} />, hint: 'À direita' },
              ]}
              value={selectedText.align}
              onChange={(align) => updateElement(selectedText.id, { align })}
            />
          </div>

          {/* CAIXA ALTA */}
          <div className={styles.row}>
            <Button
              variant={selectedText.uppercase ? 'primary' : 'secondary'}
              size="sm"
              fullWidth
              onClick={() => updateElement(selectedText.id, { uppercase: !selectedText.uppercase })}
            >
              {selectedText.uppercase ? 'TUDO MAIÚSCULO (Ativo)' : 'Tudo maiúsculo'}
            </Button>
          </div>

          {/* Cores da Paleta */}
          <ColorSwatches
            value={selectedText.color}
            onChange={(color) => updateElement(selectedText.id, { color })}
          />

          {/* Borda de Destaque (Amarela ou Barro com textura soft-light) */}
          <div className={styles.section}>
            <span style={{ fontSize: '15px', fontWeight: 700 }}>Borda de Destaque</span>
            <Segmented<BorderKind>
              options={[
                { value: 'none', label: 'Nenhuma' },
                { value: 'yellow', label: 'Amarela' },
                { value: 'clay', label: 'Barro' },
              ]}
              value={selectedText.border}
              onChange={(border) => updateElement(selectedText.id, { border })}
            />
          </div>

          {/* Efeito da Marca (Traçado creme + Sombra projetada do Photoshop) */}
          <div className={styles.row}>
            <Button
              variant={selectedText.brandEffect ? 'primary' : 'secondary'}
              size="sm"
              fullWidth
              icon={<Sparkles size={16} strokeWidth={2.5} />}
              onClick={() => updateElement(selectedText.id, { brandEffect: !selectedText.brandEffect })}
            >
              {selectedText.brandEffect ? 'Efeito da Marca (Ligado)' : 'Efeito da Marca (Desligado)'}
            </Button>
          </div>
        </Card>
      )}

      {/* Lista de textos na folha */}
      {currentTexts.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Textos na folha ({currentTexts.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {currentTexts.map((t, index) => {
              const isSelected = selectedText?.id === t.id;
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '2px solid var(--c-border)',
                    backgroundColor: isSelected ? 'var(--c-amarelo)' : 'var(--c-surface)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => select(t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontFamily: 'var(--font-headline)',
                      fontSize: '15px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span>
                      {index + 1}. {t.text ? `"${t.text.slice(0, 18)}..."` : 'Texto vazio'}
                    </span>
                  </button>
                  <IconButton
                    icon={<Trash2 size={14} strokeWidth={2.5} />}
                    label="Remover"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeElement(t.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

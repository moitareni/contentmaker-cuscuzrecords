import React from 'react';
import { FlipHorizontal, FlipVertical, Trash2 } from 'lucide-react';
import { getDecoration, manifest } from '../assets';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconButton } from '../components/ui/IconButton';
import { ThumbGrid } from '../components/ui/ThumbGrid';
import { useEditor, useSelected } from '../store/editorStore';
import type { DecorationEl } from '../types';
import styles from './StepPanel.module.css';

export const DecorationStep: React.FC = () => {
  const addDecoration = useEditor((s) => s.addDecoration);
  const placeDecoration = useEditor((s) => s.placeDecoration);
  const updateElement = useEditor((s) => s.updateElement);
  const removeElement = useEditor((s) => s.removeElement);
  const select = useEditor((s) => s.select);
  const elements = useEditor((s) => s.doc.elements);

  const selected = useSelected();
  const selectedDeco = selected && selected.kind === 'decoration' ? (selected as DecorationEl) : null;

  const currentDecorations = elements.filter((e): e is DecorationEl => e.kind === 'decoration');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>2. Enfeita aí! ✨</h2>
        <p className={styles.description}>
          Esta etapa é opcional. Toque em um enfeite para adicionar à folha e movimente livremente.
        </p>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Enfeites da Marca</h3>
        <ThumbGrid
          items={manifest.decorations}
          aspectRatio="1-1"
          columns={3}
          onSelect={(id) => addDecoration(id)}
        />
      </div>

      {/* Opções para o enfeite atualmente selecionado */}
      {selectedDeco && (
        <Card title="Posicionamento Rápido" subtitle="Encaixe nos cantos com espelhamento automático">
          <div className={styles.buttonGrid}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => placeDecoration(selectedDeco.id, 'tl')}
            >
              Superior Esq.
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => placeDecoration(selectedDeco.id, 'tr')}
            >
              Superior Dir.
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => placeDecoration(selectedDeco.id, 'bl')}
            >
              Inferior Esq.
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => placeDecoration(selectedDeco.id, 'br')}
            >
              Inferior Dir.
            </Button>
          </div>

          <div className={styles.row} style={{ marginTop: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              icon={<FlipHorizontal size={16} strokeWidth={2.5} />}
              onClick={() => updateElement(selectedDeco.id, { flipX: !selectedDeco.flipX })}
            >
              Espelhar ↔
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FlipVertical size={16} strokeWidth={2.5} />}
              onClick={() => updateElement(selectedDeco.id, { flipY: !selectedDeco.flipY })}
            >
              Espelhar ↕
            </Button>
            <IconButton
              icon={<Trash2 size={16} strokeWidth={2.5} />}
              label="Remover enfeite"
              variant="danger"
              size="sm"
              onClick={() => removeElement(selectedDeco.id)}
            />
          </div>
        </Card>
      )}

      {/* Lista de enfeites presentes na folha */}
      {currentDecorations.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Na folha ({currentDecorations.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {currentDecorations.map((d, index) => {
              const asset = getDecoration(d.assetId);
              const isSelected = selectedDeco?.id === d.id;
              return (
                <div
                  key={d.id}
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
                    onClick={() => select(d.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontFamily: 'var(--font-headline)',
                      fontSize: '15px',
                    }}
                  >
                    <span>
                      {index + 1}. {asset?.label || 'Enfeite'}
                    </span>
                  </button>
                  <IconButton
                    icon={<Trash2 size={14} strokeWidth={2.5} />}
                    label="Remover"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeElement(d.id)}
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

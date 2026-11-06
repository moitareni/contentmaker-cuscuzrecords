import React, { useState } from 'react';
import { FlipHorizontal, FlipVertical } from 'lucide-react';
import { manifest } from '../assets';
import type { PostFormat } from '../brand/brand';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Slider } from '../components/ui/Slider';
import { ThumbGrid } from '../components/ui/ThumbGrid';
import { useEditor } from '../store/editorStore';
import styles from './StepPanel.module.css';

export const BackgroundStep: React.FC = () => {
  const [tab, setTab] = useState<'pronto' | 'puro'>('pronto');
  const format = useEditor((s) => s.doc.format ?? '3:4');
  const backgroundId = useEditor((s) => s.doc.backgroundId);
  const backgroundFlipX = useEditor((s) => Boolean(s.doc.backgroundFlipX));
  const backgroundFlipY = useEditor((s) => Boolean(s.doc.backgroundFlipY));
  const backgroundOffsetY = useEditor((s) => s.doc.backgroundOffsetY ?? 180);

  const setFormat = useEditor((s) => s.setFormat);
  const setBackground = useEditor((s) => s.setBackground);
  const toggleBackgroundFlipX = useEditor((s) => s.toggleBackgroundFlipX);
  const toggleBackgroundFlipY = useEditor((s) => s.toggleBackgroundFlipY);
  const setBackgroundOffsetY = useEditor((s) => s.setBackgroundOffsetY);

  const filtered = manifest.backgrounds.filter((b) => b.category === tab);
  const gridAspectRatio = format === '4:3' ? '4-3' : format === '1:1' ? '1-1' : '3-4';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>1. Escolha o fundo 🌽</h2>
        <p className={styles.description}>
          Selecione o formato do post e a textura da sua arte.
        </p>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Formato do post</h3>
        <Segmented
          options={[
            { value: '3:4', label: 'Vertical (3:4)' },
            { value: '4:3', label: 'Horizontal (4:3)' },
            { value: '1:1', label: 'Quadrado (1:1)' },
          ]}
          value={format}
          onChange={(v) => setFormat(v as PostFormat)}
        />
      </div>

      {backgroundId && (
        <Card title="Opções do Fundo" subtitle="Espelhe ou ajuste o enquadramento da textura">
          <div className={styles.row}>
            <Button
              variant={backgroundFlipX ? 'primary' : 'secondary'}
              size="sm"
              icon={<FlipHorizontal size={16} strokeWidth={2.5} />}
              onClick={toggleBackgroundFlipX}
            >
              Espelhar ↔
            </Button>
            <Button
              variant={backgroundFlipY ? 'primary' : 'secondary'}
              size="sm"
              icon={<FlipVertical size={16} strokeWidth={2.5} />}
              onClick={toggleBackgroundFlipY}
            >
              Espelhar ↕
            </Button>
          </div>

          {format === '1:1' && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Slider
                label="Corte vertical"
                value={backgroundOffsetY}
                min={0}
                max={360}
                step={1}
                unit="px"
                onChange={setBackgroundOffsetY}
              />
              <div className={styles.buttonGrid3}>
                <Button
                  variant={backgroundOffsetY === 0 ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setBackgroundOffsetY(0)}
                >
                  Topo
                </Button>
                <Button
                  variant={backgroundOffsetY === 180 ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setBackgroundOffsetY(180)}
                >
                  Centro
                </Button>
                <Button
                  variant={backgroundOffsetY === 360 ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setBackgroundOffsetY(360)}
                >
                  Base
                </Button>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--c-text-muted)' }}>
                💡 Você também pode clicar e arrastar o fundo direto na folha para ajustar o corte.
              </p>
            </div>
          )}
        </Card>
      )}

      <Segmented
        options={[
          { value: 'pronto', label: 'Fundos Prontos' },
          { value: 'puro', label: 'Fundos Puros' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <ThumbGrid
        items={filtered}
        selectedId={backgroundId}
        aspectRatio={gridAspectRatio}
        columns={2}
        onSelect={setBackground}
      />
    </div>
  );
};

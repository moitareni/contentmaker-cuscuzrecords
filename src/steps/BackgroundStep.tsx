import React, { useState } from 'react';
import { FlipHorizontal, FlipVertical } from 'lucide-react';
import { manifest } from '../assets';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { ThumbGrid } from '../components/ui/ThumbGrid';
import { useEditor } from '../store/editorStore';
import styles from './StepPanel.module.css';

export const BackgroundStep: React.FC = () => {
  const [tab, setTab] = useState<'pronto' | 'puro'>('pronto');
  const backgroundId = useEditor((s) => s.doc.backgroundId);
  const backgroundFlipX = useEditor((s) => Boolean(s.doc.backgroundFlipX));
  const backgroundFlipY = useEditor((s) => Boolean(s.doc.backgroundFlipY));
  const setBackground = useEditor((s) => s.setBackground);
  const toggleBackgroundFlipX = useEditor((s) => s.toggleBackgroundFlipX);
  const toggleBackgroundFlipY = useEditor((s) => s.toggleBackgroundFlipY);

  const filtered = manifest.backgrounds.filter((b) => b.category === tab);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>1. Escolha o fundo 🌽</h2>
        <p className={styles.description}>
          Selecione a textura da sua arte. O fundo fica sempre perfeitamente encaixado em 3:4.
        </p>
      </div>

      {backgroundId && (
        <Card title="Opções do Fundo" subtitle="Espelhe a textura para criar novas variações">
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
        aspectRatio="3-4"
        columns={2}
        onSelect={setBackground}
      />
    </div>
  );
};

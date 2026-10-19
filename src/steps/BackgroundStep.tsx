import React, { useState } from 'react';
import { manifest } from '../assets';
import { Segmented } from '../components/ui/Segmented';
import { ThumbGrid } from '../components/ui/ThumbGrid';
import { useEditor } from '../store/editorStore';
import styles from './StepPanel.module.css';

export const BackgroundStep: React.FC = () => {
  const [tab, setTab] = useState<'pronto' | 'puro'>('pronto');
  const backgroundId = useEditor((s) => s.doc.backgroundId);
  const setBackground = useEditor((s) => s.setBackground);

  const filtered = manifest.backgrounds.filter((b) => b.category === tab);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>1. Escolha o fundinho 🌽</h2>
        <p className={styles.description}>
          Selecione a textura da sua arte. O fundo fica sempre perfeitamente encaixado em 3:4.
        </p>
      </div>

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

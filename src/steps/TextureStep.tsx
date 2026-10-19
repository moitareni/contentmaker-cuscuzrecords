import React from 'react';
import { Layers, Newspaper } from 'lucide-react';
import {
  GRAIN_INTENSITY_MAX,
  GRAIN_INTENSITY_MIN,
  GRAIN_SIZES,
  PAPER_OPACITY_MAX,
  PAPER_OPACITY_MIN,
  type GrainSize,
} from '../brand/brand';
import { getPaperTexture } from '../assets';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { Slider } from '../components/ui/Slider';
import { useEditor } from '../store/editorStore';
import styles from './StepPanel.module.css';

export const TextureStep: React.FC = () => {
  const finish = useEditor((s) => s.finish);
  const setPaper = useEditor((s) => s.setPaper);
  const setGrain = useEditor((s) => s.setGrain);
  const resetFinish = useEditor((s) => s.resetFinish);
  const paper = getPaperTexture();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>6. Textura final ✨</h2>
        <p className={styles.description}>
          O acabamento da arte. Papel amassado e granulado vêm desligados — ligue, regule e veja na hora.
        </p>
      </div>

      {/* Papel Amassado em overlay */}
      <Card title="Papel Amassado" subtitle="Opcional 🌽 desligado por padrão (sugestão: 40%)">
        {paper && (
          <img
            src={paper.thumb}
            alt="Prévia do papel amassado"
            style={{
              width: '100%',
              aspectRatio: '3 / 4',
              objectFit: 'cover',
              borderRadius: '8px',
              border: '3px solid var(--c-border)',
            }}
          />
        )}
        <div className={styles.section}>
          <Button
            variant={finish.paper.enabled ? 'primary' : 'secondary'}
            size="sm"
            fullWidth
            icon={<Newspaper size={16} strokeWidth={2.5} />}
            onClick={() => setPaper({ enabled: !finish.paper.enabled })}
          >
            {finish.paper.enabled ? 'Papel (Ligado)' : 'Papel (Desligado)'}
          </Button>
          <Slider
            label="Opacidade do papel"
            value={finish.paper.opacity}
            min={PAPER_OPACITY_MIN}
            max={PAPER_OPACITY_MAX}
            unit="%"
            onChange={(v) => setPaper({ opacity: v, enabled: true })}
          />
        </div>
      </Card>

      {/* Granulado monocromático em overlay */}
      <Card title="Granulado (Grain)" subtitle="Opcional 🌽 desligado por padrão (sugestão: 50%, grão P)">
        <div className={styles.section}>
          <Button
            variant={finish.grain.enabled ? 'primary' : 'secondary'}
            size="sm"
            fullWidth
            icon={<Layers size={16} strokeWidth={2.5} />}
            onClick={() => setGrain({ enabled: !finish.grain.enabled })}
          >
            {finish.grain.enabled ? 'Grain (Ligado)' : 'Grain (Desligado)'}
          </Button>
          <Slider
            label="Intensidade do grain"
            value={finish.grain.intensity}
            min={GRAIN_INTENSITY_MIN}
            max={GRAIN_INTENSITY_MAX}
            unit="%"
            onChange={(v) => setGrain({ intensity: v, enabled: true })}
          />
          <span style={{ fontSize: '15px', fontWeight: 700 }}>Tamanho do grão</span>
          <Segmented<GrainSize>
            options={(Object.keys(GRAIN_SIZES) as GrainSize[]).map((sz) => ({
              value: sz,
              label: GRAIN_SIZES[sz].label,
              hint: GRAIN_SIZES[sz].hint,
            }))}
            value={finish.grain.size}
            onChange={(size) => setGrain({ size, enabled: true })}
          />
        </div>
      </Card>

      {/* Volta ao acabamento padrão (desligado) */}
      <Button variant="ghost" size="sm" fullWidth onClick={resetFinish}>
        Restaurar padrão ✨
      </Button>
    </div>
  );
};

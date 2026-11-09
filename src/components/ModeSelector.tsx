import React, { useState } from 'react';
import { Images, Sparkles } from 'lucide-react';
import { POST_FORMATS, type PostFormat } from '../brand/brand';
import { switchSingleToCarousel, useCarousel } from '../store/carouselStore';
import { Button } from './ui/Button';
import { Segmented } from './ui/Segmented';
import styles from './ModeSelector.module.css';

export { switchSingleToCarousel };

export const ModeSelector: React.FC = () => {
  const [choosingFormat, setChoosingFormat] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<PostFormat>('3:4');

  const setMode = useCarousel((s) => s.setMode);
  const setFormat = useCarousel((s) => s.setFormat);
  const addSlide = useCarousel((s) => s.addSlide);

  const handleSelectSingle = () => {
    setMode('single');
  };

  const handleConfirmCarousel = () => {
    useCarousel.setState({ slides: [] });
    setFormat(selectedFormat);
    setMode('carousel');
    addSlide();
  };

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="Escolha o modo de criação">
      <div className={styles.card}>
        <div className={styles.brandHeader}>
          <img
            src="/brand/favicon-64.png"
            alt="Logo Cuscuz Records"
            className={styles.logo}
          />
          <div>
            <h1 className={styles.title}>Cuscuz Records Insta Kit 🌽</h1>
            <p className={styles.subtitle}>Bora criar arte bonita pro feed! O que vai sair hoje?</p>
          </div>
        </div>

        {!choosingFormat ? (
          <div className={styles.optionsGrid}>
            <button
              type="button"
              className={styles.modeCard}
              onClick={handleSelectSingle}
            >
              <span className={styles.modeIcon}>
                <Sparkles size={28} strokeWidth={2.5} />
              </span>
              <span className={styles.modeTitle}>Post único</span>
              <span className={styles.modeDesc}>
                Uma arte caprichada pronta para baixar em PNG.
              </span>
            </button>

            <button
              type="button"
              className={styles.modeCard}
              onClick={() => setChoosingFormat(true)}
            >
              <span className={styles.modeIcon}>
                <Images size={28} strokeWidth={2.5} />
              </span>
              <span className={styles.modeTitle}>Carrossel</span>
              <span className={styles.modeDesc}>
                Até 10 slides em sequência exportados juntos em ZIP.
              </span>
            </button>
          </div>
        ) : (
          <div className={styles.formatPicker}>
            <h2 className={styles.formatTitle}>Escolha o formato do carrossel 🎠</h2>
            <p className={styles.formatHint}>
              Todos os slides seguem a mesma proporção do começo ao fim.
            </p>

            <Segmented
              options={[
                { value: '3:4', label: POST_FORMATS['3:4'].label },
                { value: '4:3', label: POST_FORMATS['4:3'].label },
                { value: '1:1', label: POST_FORMATS['1:1'].label },
              ]}
              value={selectedFormat}
              onChange={(v) => setSelectedFormat(v as PostFormat)}
            />

            <div className={styles.formatActions}>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setChoosingFormat(false)}
              >
                Voltar
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleConfirmCarousel}
              >
                Bora criar carrossel!
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModeSelector;

import React from 'react';
import { Check } from 'lucide-react';
import { COLOR_LABELS, COLORS, type BrandColor } from '../../brand/brand';
import styles from './ColorSwatches.module.css';

export interface ColorSwatchesProps {
  value: BrandColor;
  onChange: (color: BrandColor) => void;
}

const COLOR_KEYS = Object.keys(COLORS) as BrandColor[];

export const ColorSwatches: React.FC<ColorSwatchesProps> = ({ value, onChange }) => {
  return (
    <div className={styles.container}>
      <span className={styles.label}>Cor da Marca:</span>
      <div className={styles.swatches}>
        {COLOR_KEYS.map((k) => {
          const hex = COLORS[k];
          const isSelected = value === k;
          const isLight = k === 'creme' || k === 'amarelo' || k === 'amareloQuente';
          return (
            <button
              key={k}
              type="button"
              className={`${styles.swatch} ${isSelected ? styles.selected : ''}`}
              style={{ backgroundColor: hex }}
              onClick={() => onChange(k)}
              title={`${COLOR_LABELS[k]} (${hex})`}
              aria-label={COLOR_LABELS[k]}
            >
              {isSelected && (
                <Check
                  size={16}
                  strokeWidth={4}
                  color={isLight ? '#0b0500' : '#ffffff'}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

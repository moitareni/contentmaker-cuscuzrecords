import React from 'react';
import styles from './Slider.module.css';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  limitMarker?: { value: number; label: string };
  onChange: (value: number) => void;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'px',
  limitMarker,
  onChange,
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.badge}>
          {value}
          {unit}
        </span>
      </div>
      <div className={styles.sliderWrapper}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.input}
        />
        {limitMarker && limitMarker.value >= min && limitMarker.value <= max && (
          <div
            className={styles.limitMarker}
            style={{
              left: `${((limitMarker.value - min) / (max - min)) * 100}%`,
            }}
            title={limitMarker.label}
          />
        )}
      </div>
      {limitMarker && (
        <div className={styles.limitLegend}>
          <span>Máx permitido pelo título: {limitMarker.value}px</span>
        </div>
      )}
    </div>
  );
};

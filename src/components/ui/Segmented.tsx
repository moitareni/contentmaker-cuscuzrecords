import React from 'react';
import styles from './Segmented.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  hint?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div className={`${styles.container} ${styles[size]}`}>
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`${styles.segment} ${isSelected ? styles.selected : ''}`}
            onClick={() => onChange(opt.value)}
            title={opt.hint}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

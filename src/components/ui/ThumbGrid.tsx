import React from 'react';
import { Check } from 'lucide-react';
import styles from './ThumbGrid.module.css';

export interface ThumbItem {
  id: string;
  label: string;
  thumb: string;
}

export interface ThumbGridProps {
  items: ThumbItem[];
  selectedId?: string | null;
  aspectRatio?: '3-4' | '1-1';
  columns?: 2 | 3;
  onSelect: (id: string) => void;
}

export const ThumbGrid: React.FC<ThumbGridProps> = ({
  items,
  selectedId,
  aspectRatio = '3-4',
  columns = 2,
  onSelect,
}) => {
  return (
    <div className={`${styles.grid} ${styles[`cols-${columns}`]}`}>
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.item} ${styles[aspectRatio]} ${isSelected ? styles.selected : ''}`}
            onClick={() => onSelect(item.id)}
            title={item.label}
          >
            <div className={styles.imageWrapper}>
              <img
                src={item.thumb}
                alt={item.label}
                loading="lazy"
                className={styles.image}
              />
              {isSelected && (
                <div className={styles.checkBadge}>
                  <Check size={14} strokeWidth={4} color="#ffffff" />
                </div>
              )}
            </div>
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

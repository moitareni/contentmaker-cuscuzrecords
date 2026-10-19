import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { POST_W } from '../brand/brand';
import { formatZoomPercent, zoomStepIn, zoomStepOut } from '../lib/zoom';
import { useEditor } from '../store/editorStore';
import { IconButton } from './ui/IconButton';
import styles from './ZoomControls.module.css';

/**
 * Controles de zoom da folha no dock lateral: − / % (clique = ajustar) / +.
 * O % é escala real (100% = 1px do post = 1px na tela).
 */
export const ZoomControls: React.FC = () => {
  const zoom = useEditor((s) => s.zoom);
  const fitWidth = useEditor((s) => s.fitWidth);
  const setZoom = useEditor((s) => s.setZoom);

  const fitScale = fitWidth / POST_W;
  const trueScale = fitScale * zoom;

  const stepTo = (target: number) => setZoom(target / fitScale);

  return (
    <div className={styles.controls} role="group" aria-label="Zoom da folha">
      <IconButton
        icon={<Minus size={17} strokeWidth={2.5} />}
        label="Reduzir zoom (Ctrl+-)"
        size="sm"
        onClick={() => stepTo(zoomStepOut(trueScale))}
      />
      <button
        type="button"
        className={styles.percent}
        title="Ajustar à tela (Ctrl+0)"
        onClick={() => setZoom(1)}
      >
        {formatZoomPercent(trueScale)}
      </button>
      <IconButton
        icon={<Plus size={17} strokeWidth={2.5} />}
        label="Ampliar zoom (Ctrl+=)"
        size="sm"
        onClick={() => stepTo(zoomStepIn(trueScale))}
      />
    </div>
  );
};

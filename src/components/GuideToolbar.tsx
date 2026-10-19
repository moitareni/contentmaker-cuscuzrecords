import React from 'react';
import { Crosshair, Frame, LayoutGrid, Ruler } from 'lucide-react';
import { GUIDE_MARGIN_PRESETS } from '../brand/brand';
import { useEditor } from '../store/editorStore';
import { IconButton } from './ui/IconButton';
import { Segmented } from './ui/Segmented';
import styles from './GuideToolbar.module.css';

/**
 * Controles das guias de layout (margens/centro/terços + margem configurável).
 * Sempre visível na área do canvas; atalho G alterna a visibilidade.
 */
export const GuideToolbar: React.FC = () => {
  const layoutGuides = useEditor((s) => s.layoutGuides);
  const toggleGuidesVisible = useEditor((s) => s.toggleGuidesVisible);
  const setGuideLayer = useEditor((s) => s.setGuideLayer);
  const setGuideMargin = useEditor((s) => s.setGuideMargin);

  return (
    <aside aria-label="Guias de layout" className={styles.toolbar}>
      <IconButton
        icon={<Ruler size={17} strokeWidth={2.5} />}
        label={layoutGuides.visible ? 'Esconder guias de layout (G)' : 'Mostrar guias de layout (G)'}
        size="sm"
        active={layoutGuides.visible}
        onClick={toggleGuidesVisible}
      />

      {layoutGuides.visible && (
        <>
          <div className={styles.divider} />
          <div className={styles.group}>
            <IconButton
              icon={<Frame size={17} strokeWidth={2.5} />}
              label="Guia de margens"
              size="sm"
              active={layoutGuides.showMargins}
              onClick={() => setGuideLayer({ showMargins: !layoutGuides.showMargins })}
            />
            <IconButton
              icon={<Crosshair size={17} strokeWidth={2.5} />}
              label="Guias centrais"
              size="sm"
              active={layoutGuides.showCenters}
              onClick={() => setGuideLayer({ showCenters: !layoutGuides.showCenters })}
            />
            <IconButton
              icon={<LayoutGrid size={17} strokeWidth={2.5} />}
              label="Guias de terços"
              size="sm"
              active={layoutGuides.showThirds}
              onClick={() => setGuideLayer({ showThirds: !layoutGuides.showThirds })}
            />
          </div>

          {layoutGuides.showMargins && (
            <>
              <div className={styles.divider} />
              <div className={styles.marginWrap}>
                <Segmented
                  size="sm"
                  value={String(layoutGuides.margin)}
                  onChange={(v) => setGuideMargin(Number(v))}
                  options={GUIDE_MARGIN_PRESETS.map((p) => ({
                    value: String(p),
                    label: `${p}`,
                    hint: `Margem de ${p}px`,
                  }))}
                />
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
};

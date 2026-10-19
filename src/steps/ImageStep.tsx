import React, { useRef, useState } from 'react';
import {
  BringToFront,
  FlipHorizontal,
  FlipVertical,
  ImagePlus,
  RefreshCw,
  SendToBack,
  Trash2,
} from 'lucide-react';
import { IMAGE_MAX_COUNT } from '../brand/brand';
import { importImageFiles } from '../lib/imageImport';
import { importUserImage, useUserImage } from '../lib/userImages';
import { useEditor, useSelected } from '../store/editorStore';
import type { ImageEl } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconButton } from '../components/ui/IconButton';
import styles from './StepPanel.module.css';
import localStyles from './ImageStep.module.css';

/** Linha da lista "Na folha": componente separado porque usa o hook por imagem. */
const ImageRow: React.FC<{ el: ImageEl; selected: boolean; onSelect: () => void; onRemove: () => void }> = ({
  el,
  selected,
  onSelect,
  onRemove,
}) => {
  const entry = useUserImage(el.imageId);
  return (
    <div className={`${localStyles.row} ${selected ? localStyles.rowSelected : ''}`}>
      <button
        type="button"
        className={localStyles.rowButton}
        onClick={onSelect}
        title={el.name}
      >
        <img
          src={entry?.thumbUrl}
          alt=""
          className={localStyles.rowThumb}
          style={entry ? undefined : { visibility: 'hidden' }}
        />
        <span className={localStyles.rowLabel}>
          {entry ? el.name : `${el.name} (indisponível)`}
        </span>
      </button>
      <IconButton
        icon={<Trash2 size={14} strokeWidth={2.5} />}
        label="Remover imagem"
        size="sm"
        variant="ghost"
        onClick={onRemove}
      />
    </div>
  );
};

export const ImageStep: React.FC = () => {
  const addImageButtonRef = useRef<HTMLInputElement>(null);
  const replaceButtonRef = useRef<HTMLInputElement>(null);
  const [busyFiles, setBusyFiles] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const updateElement = useEditor((s) => s.updateElement);
  const removeElement = useEditor((s) => s.removeElement);
  const select = useEditor((s) => s.select);
  const bringForward = useEditor((s) => s.bringForward);
  const sendBackward = useEditor((s) => s.sendBackward);
  const showToast = useEditor((s) => s.showToast);
  const elements = useEditor((s) => s.doc.elements);

  const selected = useSelected();
  const selectedImage = selected && selected.kind === 'image' ? (selected as ImageEl) : null;
  const currentImages = elements.filter((e): e is ImageEl => e.kind === 'image');
  const full = currentImages.length >= IMAGE_MAX_COUNT;

  const pickFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    // Zera o input: escolher o mesmo arquivo de novo tem que disparar onChange.
    if (addImageButtonRef.current) addImageButtonRef.current.value = '';
    if (!files.length) return;
    setBusyFiles((n) => n + files.length);
    void importImageFiles(files).finally(() => {
      setBusyFiles((n) => Math.max(0, n - files.length));
    });
  };

  const pickReplacement = async (list: FileList | null) => {
    const file = list?.[0];
    if (replaceButtonRef.current) replaceButtonRef.current.value = '';
    if (!file || !selectedImage) return;
    setBusyFiles(1);
    try {
      const { entry } = await importUserImage(file);
      useEditor
        .getState()
        .replaceImage(selectedImage.id, { imageId: entry.id, name: entry.name, width: entry.width, height: entry.height });
      showToast('success', 'Imagem trocada! 🌽');
    } catch {
      showToast('error', 'Não consegui ler essa imagem 🙈 Tenta outra!');
    } finally {
      setBusyFiles(0);
    }
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>3. Sua imagem 🖼️</h2>
        <p className={styles.description}>
          Esta etapa é opcional. Traga uma foto do seu PC ou arraste ela pra folha — você move,
          gira e redimensiona como os outros elementos.
        </p>
      </div>

      {/* Dropzone: clique abre o seletor; soltar arquivos adiciona direto */}
      <div className={styles.section}>
        <div
          role="button"
          tabIndex={0}
          className={`${localStyles.dropzone} ${dragOver ? localStyles.dropzoneActive : ''} ${full ? localStyles.dropzoneFull : ''}`}
          onClick={() => {
            if (!full && busyFiles === 0) addImageButtonRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !full && busyFiles === 0) {
              e.preventDefault();
              addImageButtonRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepthRef.current += 1;
            setDragOver(true);
          }}
          onDragOver={(e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => {
            if (!hasFiles(e)) return;
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setDragOver(false);
          }}
          onDrop={(e) => {
            dragDepthRef.current = 0;
            setDragOver(false);
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.stopPropagation();
            pickFiles(e.dataTransfer?.files ?? null);
          }}
        >
          <ImagePlus size={26} strokeWidth={2.5} />
          <strong className={localStyles.dropTitle}>
            {full ? 'Folha cheia de imagens!' : 'Arraste uma imagem pra cá'}
          </strong>
          <span className={localStyles.dropHint}>
            {full
              ? 'Remova uma pra dar espaço 😅'
              : busyFiles > 0
                ? 'Preparando a imagem...'
                : 'ou escolha do seu PC'}
          </span>
          <span className={localStyles.counter}>
            {currentImages.length} de {IMAGE_MAX_COUNT}
          </span>
        </div>
        <input
          ref={addImageButtonRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => pickFiles(e.target.files)}
        />
        <input
          ref={replaceButtonRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pickReplacement(e.target.files)}
        />
      </div>

      {/* Card da imagem selecionada: transformações + troca + camadas */}
      {selectedImage && (
        <Card title="Imagem Selecionada" subtitle={selectedImage.name}>
          <div className={styles.row}>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={16} strokeWidth={2.5} />}
              disabled={busyFiles > 0}
              onClick={() => replaceButtonRef.current?.click()}
            >
              Trocar imagem
            </Button>
            <IconButton
              icon={<Trash2 size={16} strokeWidth={2.5} />}
              label="Remover imagem selecionada"
              variant="danger"
              size="sm"
              onClick={() => removeElement(selectedImage.id)}
            />
          </div>
          <div className={styles.row} style={{ marginTop: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              icon={<FlipHorizontal size={16} strokeWidth={2.5} />}
              onClick={() => updateElement(selectedImage.id, { flipX: !selectedImage.flipX })}
            >
              Espelhar ↔
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FlipVertical size={16} strokeWidth={2.5} />}
              onClick={() => updateElement(selectedImage.id, { flipY: !selectedImage.flipY })}
            >
              Espelhar ↕
            </Button>
          </div>
          <div className={styles.row} style={{ marginTop: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              icon={<BringToFront size={16} strokeWidth={2.5} />}
              onClick={() => bringForward(selectedImage.id)}
            >
              Trazer pra frente
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<SendToBack size={16} strokeWidth={2.5} />}
              onClick={() => sendBackward(selectedImage.id)}
            >
              Enviar pra trás
            </Button>
          </div>
        </Card>
      )}

      {/* Lista de imagens presentes na folha */}
      {currentImages.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            Na folha ({currentImages.length}/{IMAGE_MAX_COUNT})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {currentImages.map((img) => (
              <ImageRow
                key={img.id}
                el={img}
                selected={selectedImage?.id === img.id}
                onSelect={() => select(img.id)}
                onRemove={() => removeElement(img.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

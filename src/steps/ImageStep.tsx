import React, { useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  BringToFront,
  Eraser,
  FlipHorizontal,
  FlipVertical,
  ImagePlus,
  Package,
  RefreshCw,
  RotateCcw,
  Scissors,
  SendToBack,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { IMAGE_MAX_COUNT } from '../brand/brand';
import { importImageFiles } from '../lib/imageImport';
import { getUserImageEntry, importUserImage, registerProcessedImage, useUserImage } from '../lib/userImages';
import { bgModelSizeHint, bgUsesWebGPU, removeBackground } from '../lib/bgRemoval';
import {
  beginBgProcessing,
  endBgProcessing,
  useBgModelStatus,
  useBgProcessing,
  type BgRemovalMode,
} from '../lib/bgRemovalStatus';
import { useEditor, useSelected } from '../store/editorStore';
import type { ImageEl, ImageMeta } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconButton } from '../components/ui/IconButton';
import styles from './StepPanel.module.css';
import localStyles from './ImageStep.module.css';

// ------------------------------------------------------- preferência de modo

const BG_MODE_STORAGE_KEY = 'cuscuz-insta-kit:bg-mode';

function readLastBgMode(): BgRemovalMode | null {
  try {
    const v = localStorage.getItem(BG_MODE_STORAGE_KEY);
    return v === 'person' || v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function saveLastBgMode(mode: BgRemovalMode): void {
  try {
    localStorage.setItem(BG_MODE_STORAGE_KEY, mode);
  } catch {
    // Modo privado sem localStorage: segue sem lembrar a escolha.
  }
}

function formatMB(bytes: number): string {
  return `${Math.max(0, Math.round(bytes / (1024 * 1024)))}MB`;
}

// ------------------------------------------------------- quadro de recorte

const BG_MODES: { mode: BgRemovalMode; icon: React.ReactNode; label: string; hint: string }[] = [
  {
    mode: 'person',
    icon: <UserRound size={22} strokeWidth={2.5} />,
    label: 'Pessoa',
    hint: 'Pra retratos e figuras — cabelo e detalhes suaves preservados',
  },
  {
    mode: 'object',
    icon: <Package size={22} strokeWidth={2.5} />,
    label: 'Objeto',
    hint: 'Pra produtos, capas e elementos — bordas limpas e firmes',
  },
];

type BgPanelStep = 'choose' | 'download' | 'processing' | 'error';

interface RemoveBgPanelProps {
  el: ImageEl;
  lastMode: BgRemovalMode | null;
  onClose: () => void;
  onChoose: (mode: BgRemovalMode) => void;
  onRetry: () => void;
  onCancel: () => void;
}

/**
 * Quadro de recorte em slot fixo do painel (onde vive o chip de progresso):
 * abre no topo e NÃO fecha com clique fora/ESC — só no X, como pedido.
 * Durante o download/recorte o X desativa e entra o botão "Cancelar".
 */
const RemoveBgPanel: React.FC<RemoveBgPanelProps> = ({ el, lastMode, onClose, onChoose, onRetry, onCancel }) => {
  const model = useBgModelStatus();
  const processing = useBgProcessing();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const step: BgPanelStep =
    processing && model.phase !== 'downloading'
      ? 'processing'
      : model.phase === 'downloading'
        ? 'download'
        : model.phase === 'error'
          ? 'error'
          : 'choose';

  const pct = Math.round(model.progress * 100);
  // aria-live em passos de 5%: o leitor não fala 100 vezes seguidas.
  const livePct = Math.round(pct / 5) * 5;
  // Enquanto algo roda, fechar não cancela nada: só o botão "Cancelar" cancela.
  const running = step === 'download' || step === 'processing';

  // Foco no primeiro botão útil do passo (nunca no X, que é o último recurso).
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'));
    (buttons.find((b) => !b.disabled && b.getAttribute('aria-label') !== 'Fechar') ?? buttons[0])?.focus();
  }, [step]);

  return (
    <div ref={panelRef} className={localStyles.panel} role="group" aria-label="Remover fundo">
      <div className={localStyles.panelHeader}>
        <strong className={localStyles.panelTitle}>
          {step === 'choose' && 'Remover fundo'}
          {step === 'download' && 'Só um instante…'}
          {step === 'processing' && 'Recortando…'}
          {step === 'error' && 'Ops!'}
        </strong>
        <IconButton
          icon={<X size={16} strokeWidth={2.5} />}
          label="Fechar"
          variant="ghost"
          size="sm"
          disabled={running}
          onClick={onClose}
        />
      </div>

      {step === 'choose' && (
        <>
          <p className={localStyles.panelSub}>Escolha o tipo de recorte pra “{el.name}”:</p>
          <div className={localStyles.modeGrid}>
            {BG_MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                className={`${localStyles.modeCard} ${lastMode === m.mode ? localStyles.modeCardLast : ''}`}
                onClick={() => onChoose(m.mode)}
              >
                <span className={localStyles.modeIcon} aria-hidden="true">
                  {m.icon}
                </span>
                <span className={localStyles.modeText}>
                  <span className={localStyles.modeLabel}>
                    {m.label}
                    {lastMode === m.mode && <span className={localStyles.lastUsedTag}>última usada</span>}
                  </span>
                  <span className={localStyles.modeHint}>{m.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {model.phase === 'idle' && (
            <p className={localStyles.note}>
              Primeira vez: baixamos a ferramenta de recorte ({bgModelSizeHint()}) uma vez só e guardamos no
              navegador. Depois funciona até offline 🌽
            </p>
          )}
        </>
      )}

      {step === 'download' && (
        <>
          <div className={localStyles.progressBox}>
            <span
              className={localStyles.spinner}
              style={{ width: 28, height: 28, borderWidth: 4 }}
              aria-hidden="true"
            />
            <strong className={localStyles.progressTitle}>Preparando a ferramenta de recorte…</strong>
            <span className={localStyles.progressHint}>Uma vez só — depois fica salva no navegador 🌽</span>
            <div
              className={localStyles.progressTrack}
              role="progressbar"
              aria-label="Download da ferramenta de recorte"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className={localStyles.progressFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={localStyles.progressLabel} aria-live="polite">
              {model.totalBytes > 0
                ? `${formatMB(model.loadedBytes)} de ${formatMB(model.totalBytes)} · ${livePct}%`
                : 'Conectando…'}
            </span>
          </div>
          <Button variant="secondary" size="sm" fullWidth onClick={onCancel}>
            Cancelar
          </Button>
        </>
      )}

      {step === 'processing' && (
        <>
          <div className={localStyles.progressBox}>
            <span
              className={localStyles.spinner}
              style={{ width: 28, height: 28, borderWidth: 4 }}
              aria-hidden="true"
            />
            <strong className={localStyles.progressTitle}>{processing?.label ?? el.name}</strong>
            <span className={localStyles.progressHint}>
              {bgUsesWebGPU() ? 'Levanta uns segundinhos ✨' : 'Essa pode demorar uma minutinha ☕'}
            </span>
          </div>
          <Button variant="secondary" size="sm" fullWidth onClick={onCancel}>
            Cancelar
          </Button>
        </>
      )}

      {step === 'error' && (
        <>
          <p className={localStyles.panelSub}>
            Não consegui baixar a ferramenta de recorte 🙈 Checa a internet e tenta de novo!
          </p>
          <div className={localStyles.panelActions}>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Fechar
            </Button>
            <Button variant="primary" size="sm" onClick={onRetry}>
              Tentar de novo
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// --------------------------------------------------------------------- lista

/** Linha da lista "Na folha": componente separado porque usa o hook por imagem. */
const ImageRow: React.FC<{
  el: ImageEl;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRemoveBg: () => void;
  removeBgDisabled: boolean;
  removeBgBusy: boolean;
}> = ({ el, selected, onSelect, onRemove, onRemoveBg, removeBgDisabled, removeBgBusy }) => {
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
        icon={
          removeBgBusy ? (
            <span className={localStyles.buttonSpinner} aria-hidden="true" />
          ) : (
            <Scissors size={14} strokeWidth={2.5} />
          )
        }
        label={`Remover fundo de ${el.name}`}
        size="sm"
        variant="ghost"
        disabled={removeBgDisabled}
        onClick={onRemoveBg}
      />
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

// -------------------------------------------------------------------- painel

export const ImageStep: React.FC = () => {
  const addImageButtonRef = useRef<HTMLInputElement>(null);
  const replaceButtonRef = useRef<HTMLInputElement>(null);
  const [busyFiles, setBusyFiles] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  /** Imagem alvo do quadro de recorte (independente da seleção: o quadro não
      some quando a usuária sai mexendo na folha). */
  const [bgPanelImageId, setBgPanelImageId] = useState<string | null>(null);
  const [lastBgMode, setLastBgMode] = useState<BgRemovalMode | null>(() => readLastBgMode());
  const lastRunRef = useRef<{ el: ImageEl; mode: BgRemovalMode } | null>(null);
  /** Época do fluxo: incrementar invalida o run em andamento (cancelamento). */
  const bgRunEpochRef = useRef(0);

  const bgModel = useBgModelStatus();
  const bgProc = useBgProcessing();

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

  const bgPanelEl =
    elements.find((e): e is ImageEl => e.kind === 'image' && e.id === bgPanelImageId) ?? null;
  /** O quadro substitui o botão quando o alvo é a imagem selecionada do card. */
  const panelInCard = !!selectedImage && selectedImage.id === bgPanelImageId;

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

  // ------------------------------------------------------- remover fundo

  const runBgRemoval = async (el: ImageEl, mode: BgRemovalMode) => {
    const entry = getUserImageEntry(el.imageId);
    if (!entry) {
      useEditor.getState().showToast('error', 'Não achei essa imagem 🙈 Tenta importar de novo!');
      return;
    }
    const epoch = ++bgRunEpochRef.current;
    lastRunRef.current = { el, mode };
    beginBgProcessing({ imageElId: el.id, mode, label: el.name });
    try {
      const { blob } = await removeBackground(entry.url, el.width, el.height, mode);
      if (epoch !== bgRunEpochRef.current) return; // cancelado: descarta o resultado
      const { entry: cut, persisted } = await registerProcessedImage(
        blob,
        `${el.name} · sem fundo`,
        el.width,
        el.height,
      );
      if (epoch !== bgRunEpochRef.current) return;
      const st = useEditor.getState();
      // A imagem pode ter sido apagada/desfeita enquanto o recorte rodava.
      if (!st.doc.elements.some((e) => e.id === el.id)) {
        st.showToast('info', 'A imagem sumiu antes de o recorte terminar 👀');
      } else {
        const restore: ImageMeta = { imageId: el.imageId, name: el.name, width: el.width, height: el.height };
        st.replaceImage(
          el.id,
          { imageId: cut.id, name: cut.name, width: cut.width, height: cut.height },
          restore,
        );
        st.showToast(
          'success',
          persisted
            ? 'Prontinho! Fundo removido ✨ Se não curtir, Ctrl+Z desfaz 😉'
            : 'Prontinho! Fundo removido ✨ Mas essa versão não fica salva depois de recarregar 👀',
        );
      }
      setBgPanelImageId(null);
    } catch (err) {
      if (epoch !== bgRunEpochRef.current) return; // cancelado: erro não interessa mais
      const code = err instanceof Error ? err.message : '';
      useEditor.getState().showToast(
        'error',
        code === 'bg-model'
          ? 'Não consegui baixar a ferramenta de recorte 🙈 Checa a internet e tenta de novo!'
          : 'Eita, essa máquina não deu conta do recorte agora 🌽 Tenta de novo!',
      );
    } finally {
      if (epoch === bgRunEpochRef.current) endBgProcessing();
    }
  };

  const cancelBgRemoval = () => {
    bgRunEpochRef.current += 1;
    endBgProcessing();
    setBgPanelImageId(null);
    const downloading = bgModel.phase === 'downloading';
    useEditor.getState().showToast(
      'info',
      downloading
        ? 'Remoção cancelada! A ferramenta continua baixando pra deixar tudo pronto 🌽'
        : 'Remoção cancelada!',
    );
  };

  const chooseBgMode = (mode: BgRemovalMode) => {
    saveLastBgMode(mode);
    setLastBgMode(mode);
    const el = bgPanelEl;
    if (!el) return;
    void runBgRemoval(el, mode);
  };

  const retryBgRemoval = () => {
    const last = lastRunRef.current;
    const el = bgPanelEl;
    if (!last || !el || el.id !== last.el.id) {
      setBgPanelImageId(null);
      return;
    }
    void runBgRemoval(el, last.mode);
  };

  /** Volta a foto com fundo: troca pela original guardada no cutFrom. */
  const revertBgRemoval = (el: ImageEl) => {
    const prev = el.cutFrom;
    if (!prev) return;
    if (!getUserImageEntry(prev.imageId)) {
      useEditor.getState().updateElement(el.id, { cutFrom: undefined });
      showToast('info', 'Ops, a foto original não está mais aqui 🙈');
      return;
    }
    useEditor
      .getState()
      .replaceImage(el.id, { imageId: prev.imageId, name: prev.name, width: prev.width, height: prev.height });
    showToast('success', 'Fundo de volta! ✨ Se quiser, dá pra recortar de novo');
  };

  /** Abre o quadro no slot: seleciona a imagem (feedback) e ancora o alvo. */
  const openBgPanel = (id: string) => {
    select(id);
    setBgPanelImageId(id);
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  return (
    <div className={styles.container}>
      {/* Quadro de recorte: dentro do card quando a imagem alvo está selecionada
          (o botão vira o quadro); recua pra cá no topo se a seleção mudar —
          clique fora nunca fecha, só o X. */}
      {!panelInCard && bgPanelEl && (
        <RemoveBgPanel
          el={bgPanelEl}
          lastMode={lastBgMode}
          onClose={() => setBgPanelImageId(null)}
          onChoose={chooseBgMode}
          onRetry={retryBgRemoval}
          onCancel={cancelBgRemoval}
        />
      )}

      {/* Recorte escondido em background: chip reabre o quadro */}
      {!bgPanelEl && (bgModel.phase === 'downloading' || bgProc) && (
        <button
          type="button"
          className={localStyles.chip}
          aria-label="Abrir detalhes do recorte"
          onClick={() => {
            const id = bgProc?.imageElId;
            if (id) openBgPanel(id);
          }}
        >
          <span className={localStyles.spinner} aria-hidden="true" />
          <span className={localStyles.chipText}>
            {bgModel.phase === 'downloading'
              ? `Baixando ferramenta de recorte… ${Math.round(bgModel.progress * 100)}%`
              : `Recortando ${bgProc?.label ?? ''}…`}
          </span>
        </button>
      )}

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
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          icon={<AppWindow size={16} strokeWidth={2.5} />}
          onClick={() => {
            useEditor.getState().addDecoration('janela');
            useEditor.getState().showToast('info', 'Moldura Janela adicionada! Encaixe sobre sua foto 🌽');
          }}
        >
          + Moldura Janela (Windows)
        </Button>
      </div>

      {/* Card da imagem selecionada: transformações + troca + recorte + camadas */}
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
          {/* O botão vira o quadro de recorte: mesma posição, zero drama. */}
          <div className={styles.row} style={{ marginTop: '8px' }}>
            {selectedImage.cutFrom && !panelInCard ? (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                icon={<RotateCcw size={16} strokeWidth={2.5} />}
                disabled={!!bgProc}
                title="Volta pra foto com fundo original"
                onClick={() => revertBgRemoval(selectedImage)}
              >
                Reverter fundo
              </Button>
            ) : panelInCard ? (
              <RemoveBgPanel
                el={selectedImage}
                lastMode={lastBgMode}
                onClose={() => setBgPanelImageId(null)}
                onChoose={chooseBgMode}
                onRetry={retryBgRemoval}
                onCancel={cancelBgRemoval}
              />
            ) : (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                icon={
                  bgProc?.imageElId === selectedImage.id ? (
                    <span className={localStyles.buttonSpinner} aria-hidden="true" />
                  ) : (
                    <Eraser size={16} strokeWidth={2.5} />
                  )
                }
                disabled={!!bgProc}
                title={
                  bgProc && bgProc.imageElId !== selectedImage.id
                    ? 'Acabando o primeiro recorte 😉'
                    : 'Recorta o fundo desta imagem'
                }
                onClick={() => openBgPanel(selectedImage.id)}
              >
                Remover fundo
              </Button>
            )}
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
                onRemoveBg={() => openBgPanel(img.id)}
                removeBgDisabled={!!bgProc}
                removeBgBusy={bgProc?.imageElId === img.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

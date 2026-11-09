import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { getPostDimensions } from './brand/brand';
import { EditorCanvas, type EditorCanvasHandle } from './canvas/EditorCanvas';
import { AlignToolbar } from './components/AlignToolbar';
import { GuideToolbar } from './components/GuideToolbar';
import { Header } from './components/Header';
import { StepFooter } from './components/StepFooter';
import { Stepper } from './components/Stepper';
import { Toast } from './components/Toast';
import { ZoomControls } from './components/ZoomControls';
import { IconButton } from './components/ui/IconButton';
import { exportPost } from './lib/export';
import { CarouselExportError, exportCarousel } from './lib/exportCarousel';
import { useKeyboardShortcuts } from './lib/shortcuts';
import { BackgroundStep } from './steps/BackgroundStep';
import { DecorationStep } from './steps/DecorationStep';
import { ImageStep } from './steps/ImageStep';
import { LogoStep } from './steps/LogoStep';
import { TextStep } from './steps/TextStep';
import { TextureStep } from './steps/TextureStep';
import { useCarousel } from './store/carouselStore';
import { useEditor } from './store/editorStore';
import type { AlignMode } from './types';
import styles from './App.module.css';

const ModeSelector = React.lazy(() => import('./components/ModeSelector'));
const SlideTray = React.lazy(() => import('./components/carousel/SlideTray'));

export const App: React.FC = () => {
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const [isExporting, setIsExporting] = useState(false);

  const mode = useCarousel((s) => s.mode);
  const step = useEditor((s) => s.step);
  const select = useEditor((s) => s.select);
  const showToast = useEditor((s) => s.showToast);

  // Ativa atalhos de teclado (Ctrl+Z, Delete, Setas, etc.)
  useKeyboardShortcuts();

  const handleAlign = (alignMode: AlignMode) => {
    canvasRef.current?.alignSelected(alignMode);
  };

  const handleExport = async () => {
    const stage = canvasRef.current?.getStage();
    const displayWidth = canvasRef.current?.getDisplayWidth();

    if (!stage || !displayWidth) {
      showToast('error', 'Ops, não conseguimos capturar a folha 🙈');
      return;
    }

    // Guarda a visibilidade das guias para restaurar depois
    const guidesWereVisible = useEditor.getState().layoutGuides.visible;

    try {
      setIsExporting(true);
      // Desmarca qualquer elemento ativo para que o Transformer não apareça no PNG
      select(null);
      // Fecha a edição in-place (as camadas de texto se escondem ao editar)
      useEditor.getState().setEditing(null);
      // Esconde as guias de layout para que não vazem para o PNG
      useEditor.getState().setGuidesVisible(false);

      // Aguarda um frame para que Transformer, editor e guias saiam da renderização
      await new Promise((res) => setTimeout(res, 50));

      const currentDoc = useEditor.getState().doc;
      const { width: postWidth, height: postHeight } = getPostDimensions(currentDoc.format);

      await exportPost({
        stage,
        stageDisplayWidth: displayWidth,
        postWidth,
        postHeight,
      });

      showToast('success', 'Post salvo com sucesso! 🌽 Prontinho pro feed do Insta!');
    } catch (err) {
      console.error(err);
      showToast('error', 'Houve um probleminha ao exportar o post 🙈');
    } finally {
      if (guidesWereVisible) useEditor.getState().setGuidesVisible(true);
      setIsExporting(false);
    }
  };

  const handleExportCarousel = async () => {
    const stage = canvasRef.current?.getStage();
    const displayWidth = canvasRef.current?.getDisplayWidth();
    if (!stage || !displayWidth) {
      showToast('error', 'Ops, não conseguimos capturar a folha 🙈');
      return;
    }

    const { slides, format, activeSlideIndex: originalActiveIndex } = useCarousel.getState();
    const guidesWereVisible = useEditor.getState().layoutGuides.visible;

    try {
      useCarousel.getState().setExporting({ current: 0, total: slides.length });
      useEditor.getState().select(null);
      useEditor.getState().setEditing(null);
      useEditor.getState().setGuidesVisible(false);

      await exportCarousel({
        slides,
        format,
        stage,
        stageDisplayWidth: displayWidth,
        onProgress: (current, total) =>
          useCarousel.getState().setExporting({ current, total }),
      });

      useEditor.getState().showToast('success', 'Carrossel exportado! 🌽 Prontinho pro Insta!');
    } catch (err) {
      console.error(err);
      const slideNum = err instanceof CarouselExportError ? ` ${err.slideNumber}` : '';
      useEditor
        .getState()
        .showToast('error', `Erro ao exportar o slide${slideNum} do carrossel 😵 Tente novamente.`);
    } finally {
      useCarousel.getState().setExporting(null);
      if (guidesWereVisible) useEditor.getState().setGuidesVisible(true);
      // Recarrega o slide que estava ativo antes da exportação
      useCarousel.getState().setActiveSlide(originalActiveIndex);
    }
  };

  return (
    <div className={styles.app}>
      {mode === null && (
        <React.Suspense fallback={null}>
          <ModeSelector />
        </React.Suspense>
      )}

      <Header onExportCarousel={handleExportCarousel} />
      <Stepper />

      <main className={styles.main}>
        {/* Painel Lateral com os passos */}
        <section aria-label="Painel de ferramentas" className={styles.sidebar}>
          <div className={styles.stepContent}>
            {step === 0 && <BackgroundStep />}
            {step === 1 && <DecorationStep />}
            {step === 2 && <ImageStep />}
            {step === 3 && <TextStep />}
            {step === 4 && <LogoStep />}
            {step === 5 && <TextureStep />}
          </div>
          <StepFooter />
        </section>

        {/* Coluna da Folha de Criação + Tira de Miniaturas (em Modo Carrossel) */}
        <div className={styles.workspaceColumn}>
          <section aria-label="Folha de criação" className={styles.canvasArea}>
            <EditorCanvas ref={canvasRef} />
            {/* Dock lateral: ações do elemento + guias + download único */}
            <aside aria-label="Ferramentas da folha" className={styles.dock}>
              <ZoomControls />
              <AlignToolbar onAlignToPage={handleAlign} />
              <GuideToolbar />
              <IconButton
                icon={<Download size={22} strokeWidth={2.5} />}
                label={isExporting ? 'Exportando post 1080×1440...' : 'Baixar post 1080×1440'}
                variant="primary"
                size="lg"
                disabled={isExporting}
                onClick={handleExport}
                className={styles.dockDownload}
              />
            </aside>
          </section>

          {mode === 'carousel' && (
            <React.Suspense fallback={null}>
              <SlideTray stageRef={canvasRef} />
            </React.Suspense>
          )}
        </div>
      </main>

      {/* Notificações e Toasts fofos */}
      <Toast />
    </div>
  );
};

import confetti from 'canvas-confetti';
import type Konva from 'konva';
import { POST_H, POST_W } from '../brand/brand';
import { ensureFontsLoaded } from './fonts';
import { ensureUserImagesReady } from './userImages';

export function fireCuteConfetti() {
  confetti({
    particleCount: 50,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#f8ce2b', '#f6c01f', '#942911', '#698f3f', '#f7ebcd'],
    ticks: 200,
    gravity: 1.2,
    scalar: 1.1,
  });
}

function formatDateForFile(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  return `${Y}-${M}-${D}-${h}${m}`;
}

export interface ExportOptions {
  stage: Konva.Stage;
  stageDisplayWidth: number;
}

/** `data.userImageId` marcado no Konva Group pela ImageNode. */
function userImageIdOf(node: Konva.Node): string | undefined {
  const data = node.getAttr('data') as { userImageId?: string } | undefined;
  return typeof data?.userImageId === 'string' ? data.userImageId : undefined;
}

function collectUserImageIds(stage: Konva.Stage): Set<string> {
  const ids = new Set<string>();
  const nodes = stage.find((n: Konva.Node) => !!userImageIdOf(n)) as unknown as Konva.Node[];
  for (const node of nodes) {
    const id = userImageIdOf(node);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Exporta o post em alta resolução (exatamente 1080×1440 PNG)
 * e dispara o download com confete comemorativo.
 */
export async function exportPost({ stage, stageDisplayWidth }: ExportOptions): Promise<void> {
  await ensureFontsLoaded();
  // Imagens do usuário podem estar no meio do load esperado pelo Konva.
  await ensureUserImagesReady(collectUserImageIds(stage));

  // O stage renderiza no displayWidth escalado.
  // pixelRatio garante que a saída seja precisamente 1080×1440.
  const pixelRatio = POST_W / stageDisplayWidth;

  const dataUrl = stage.toDataURL({
    pixelRatio,
    mimeType: 'image/png',
    // A folha começa no canto do pad do palco (stage.x/y); recorta a partir
    // dela para que o PNG saia exatamente 1080×1440 da arte.
    x: stage.x(),
    y: stage.y(),
    width: stageDisplayWidth,
    height: (stageDisplayWidth * POST_H) / POST_W,
  });

  const filename = `cuscuz-post-${formatDateForFile()}.png`;

  // Tenta Web Share API se suportado com arquivos no mobile/touch
  if (navigator.canShare && navigator.share) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Cuscuz Records Insta Post',
        });
        fireCuteConfetti();
        return;
      }
    } catch {
      // Falha ou cancelamento do share -> cai no download tradicional
    }
  }

  // Download padrão via elemento âncora
  const a = document.createElement('a');
  a.download = filename;
  a.href = dataUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  fireCuteConfetti();
}

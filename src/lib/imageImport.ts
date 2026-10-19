import type { ImageMeta } from '../store/editorStore';
import { hasImageSlots } from './imageRules';
import { importUserImage } from './userImages';
import { useEditor } from '../store/editorStore';

/**
 * Fila de importação das imagens do usuário (etapa 3): processa os arquivos
 * um a um, respeita o limite de 5 e emite os toasts da marca para cada falha.
 * Usada pelo drop no canvas, pelo drop no painel e pelo seletor de arquivos.
 */
export async function importImageFiles(
  files: File[],
  at?: { x: number; y: number },
): Promise<number> {
  let added = 0;
  for (const file of files) {
    const before = useEditor.getState();
    if (!hasImageSlots(before.doc.elements)) {
      before.showToast('info', 'Tá lotado! Cabem até 5 imagens por post 😅');
      break;
    }
    try {
      const { entry, persisted } = await importUserImage(file);
      const st = useEditor.getState();
      if (!hasImageSlots(st.doc.elements)) {
        st.showToast('info', 'Tá lotado! Cabem até 5 imagens por post 😅');
        break;
      }
      st.addImage({ imageId: entry.id, name: entry.name, width: entry.width, height: entry.height }, at);
      added += 1;
      if (!persisted) {
        st.showToast('info', 'Entrou na folha! Mas essa imagem não fica salva depois de recarregar 👀');
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const toast =
        code === 'tipo-nao-suportado'
          ? 'Hm, esse formato de arquivo não rola 🙈'
          : code === 'arquivo-grande'
            ? 'Opa, mais de 25 MB! Manda uma imagem mais leve 🌽'
            : 'Não consegui ler essa imagem 🙈 Tenta outra!';
      useEditor.getState().showToast('error', toast);
    }
  }
  return added;
}

export type { ImageMeta };

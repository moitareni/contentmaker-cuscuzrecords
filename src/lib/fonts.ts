import '@fontsource/londrina-solid/900.css';
import '@fontsource/pt-sans-narrow/400.css';
import '@fontsource/pt-sans-narrow/700.css';
import { FONT_BODY, FONT_HEADLINE } from '../brand/brand';

let loadedPromise: Promise<void> | null = null;

/**
 * Garante que as fontes da marca foram totalmente carregadas pelo navegador
 * antes de desenhar no Canvas ou exportar para PNG.
 */
export function ensureFontsLoaded(): Promise<void> {
  if (loadedPromise) return loadedPromise;

  if (typeof document === 'undefined' || !('fonts' in document)) {
    loadedPromise = Promise.resolve();
    return loadedPromise;
  }

  loadedPromise = Promise.all([
    document.fonts.load(`900 48px "${FONT_HEADLINE}"`),
    document.fonts.load(`700 48px "${FONT_BODY}"`),
    document.fonts.load(`400 48px "${FONT_BODY}"`),
    document.fonts.ready,
  ]).then(() => undefined);

  return loadedPromise;
}

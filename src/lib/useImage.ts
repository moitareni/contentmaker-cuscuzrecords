import { useEffect, useState } from 'react';

const cache = new Map<string, HTMLImageElement>();

/**
 * Hook para carregar HTMLImageElement com cache em memória.
 * Seguro para uso em Konva Image e pré-carregamentos.
 */
export function useImage(src: string | null | undefined): [HTMLImageElement | null, 'loading' | 'loaded' | 'error'] {
  const [image, setImage] = useState<HTMLImageElement | null>(() => (src ? cache.get(src) ?? null : null));
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(() => {
    if (!src) return 'loaded';
    return cache.has(src) ? 'loaded' : 'loading';
  });

  useEffect(() => {
    if (!src) {
      setImage(null);
      setStatus('loaded');
      return;
    }

    const cached = cache.get(src);
    if (cached) {
      setImage(cached);
      setStatus('loaded');
      return;
    }

    let active = true;
    setStatus('loading');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;

    img.onload = () => {
      cache.set(src, img);
      if (active) {
        setImage(img);
        setStatus('loaded');
      }
    };

    img.onerror = () => {
      if (active) {
        setImage(null);
        setStatus('error');
      }
    };

    return () => {
      active = false;
    };
  }, [src]);

  return [image, status];
}

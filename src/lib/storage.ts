import type { StateStorage } from 'zustand/middleware';

const SINGLE_DRAFT_KEY = 'cuscuz-insta-kit:rascunho';

let suppressSingleDraftWrite = false;

/**
 * Quando ativo (durante operações do carrossel ou enquanto o modo carrossel está ativo),
 * impede que o persist do `useEditor` grave na chave `'cuscuz-insta-kit:rascunho'`.
 */
export function setSuppressSingleDraftWrite(suppress: boolean): void {
  suppressSingleDraftWrite = suppress;
}

export function isSingleDraftWriteSuppressed(): boolean {
  return suppressSingleDraftWrite;
}

/** Grava o rascunho com debounce e garante a gravação ao fechar a aba. */
export function debouncedLocalStorage(delay = 300): StateStorage {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: [string, string] | null = null;
  const flush = () => {
    if (pending) {
      const [k, v] = pending;
      pending = null;
      if (k === SINGLE_DRAFT_KEY && suppressSingleDraftWrite) return;
      localStorage.setItem(k, v);
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => {
      if (k === SINGLE_DRAFT_KEY && suppressSingleDraftWrite) {
        if (pending && pending[0] === SINGLE_DRAFT_KEY) {
          pending = null;
          clearTimeout(timer);
        }
        return;
      }
      pending = [k, v];
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (k) => {
      if (pending && pending[0] === k) {
        pending = null;
        clearTimeout(timer);
      }
      localStorage.removeItem(k);
    },
  };
}

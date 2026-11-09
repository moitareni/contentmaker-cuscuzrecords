import { useSyncExternalStore } from 'react';

/**
 * Store module-level mínima para `useSyncExternalStore`.
 *
 * Padrão do projeto para estados fora do Zustand (registry de imagens,
 * status do modelo de recorte): estado simples, listeners num Set e um hook
 * `use()` que subscreve o componente React. Cada store vive como constante
 * de módulo e as funções públicas do arquivo expõem get/patch sobre ela.
 */
export function createExternalStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  return {
    get: () => state,
    set: (next: T | ((prev: T) => T)) => {
      // O cast distingue updater de valor (T nunca é função nas stores daqui,
      // então um updater passado é sempre chamável sobre o estado atual).
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      emit();
    },
    patch: (partial: Partial<T>) => {
      state = { ...state, ...partial };
      emit();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    use: () =>
      useSyncExternalStore((l) => {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      }, () => state),
  };
}

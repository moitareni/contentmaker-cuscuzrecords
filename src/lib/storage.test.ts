import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debouncedLocalStorage } from './storage';

describe('debouncedLocalStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('setItem grava com debounce', () => {
    const storage = debouncedLocalStorage(300);
    storage.setItem('test-key', 'val-1');
    storage.setItem('test-key', 'val-2');

    expect(localStorage.getItem('test-key')).toBeNull();

    vi.advanceTimersByTime(299);
    expect(localStorage.getItem('test-key')).toBeNull();

    vi.advanceTimersByTime(1);
    expect(localStorage.getItem('test-key')).toBe('val-2');
  });

  it('getItem e removeItem operam sobre localStorage diretamente', () => {
    const storage = debouncedLocalStorage(300);
    localStorage.setItem('k1', 'v1');
    expect(storage.getItem('k1')).toBe('v1');

    storage.removeItem('k1');
    expect(localStorage.getItem('k1')).toBeNull();
  });

  it('faz flush imediato no evento beforeunload', () => {
    const storage = debouncedLocalStorage(300);
    storage.setItem('unload-key', 'saved-on-unload');
    expect(localStorage.getItem('unload-key')).toBeNull();

    window.dispatchEvent(new Event('beforeunload'));
    expect(localStorage.getItem('unload-key')).toBe('saved-on-unload');
  });
});

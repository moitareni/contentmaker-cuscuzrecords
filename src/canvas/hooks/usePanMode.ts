import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

/**
 * Espaço segurado = modo pan (arrastar move a rolagem, sem tocar nos elementos).
 * `handlePanMouseDown` vai no `onMouseDownCapture` do container e do overlay:
 * capturados antes do Konva, para que nem selecionem nem arrastem elementos.
 */
export function usePanMode(containerRef: RefObject<HTMLElement | null>) {
  const [panning, setPanning] = useState(false);
  const [panActive, setPanActive] = useState(false);
  const panningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    const isTyping = () => {
      const t = document.activeElement as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping()) return;
      e.preventDefault();
      panningRef.current = true;
      setPanning(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      panningRef.current = false;
      panStartRef.current = null;
      setPanning(false);
      setPanActive(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (!panActive) return;
    const move = (e: MouseEvent) => {
      const s = panStartRef.current;
      const c = containerRef.current;
      if (!s || !c) return;
      c.scrollLeft = s.sl - (e.clientX - s.x);
      c.scrollTop = s.st - (e.clientY - s.y);
    };
    const end = () => {
      panStartRef.current = null;
      setPanActive(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
    };
  }, [panActive, containerRef]);

  const handlePanMouseDown = (e: ReactMouseEvent) => {
    if (!panningRef.current) return;
    // Captura antes do Konva: nem seleciona nem arrasta elementos
    e.stopPropagation();
    e.preventDefault();
    const c = containerRef.current;
    if (!c) return;
    panStartRef.current = { x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop };
    setPanActive(true);
  };

  return { panning, panActive, handlePanMouseDown };
}

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Konva: any;
  }
}

interface Persisted {
  id: string;
  kind: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  fontSize?: number;
  style?: string;
}

/** Rascunho persistido (debounce de 300ms no store): fonte de verdade para asserções. */
async function doc(page: Page): Promise<Persisted[]> {
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const ed = (window as any).__useEditor;
    if (ed) return ed.getState().doc.elements;
    const raw = localStorage.getItem('cuscuz-insta-kit:rascunho');
    return raw ? JSON.parse(raw).state.doc.elements : [];
  });
}

/** Centro (px de tela) de um elemento do post, a partir do nó Konva do palco principal. */
async function screenCenter(page: Page, id: string) {
  return page.evaluate((eid) => {
    const stage = window.Konva.stages[0];
    const node = stage.findOne(`#${eid}`);
    const layer = stage.findOne('Layer');
    const box = node.getClientRect({ relativeTo: layer });
    const sheet = document.querySelector('[class*=sheetClip]')!.getBoundingClientRect();
    const k = sheet.width / 1080;
    return { x: sheet.left + (box.x + box.width / 2) * k, y: sheet.top + (box.y + box.height / 2) * k };
  }, id);
}

/** Quantos nós o Transformer tem hoje (1 = seleção simples). */
const trCount = (page: Page) =>
  page.evaluate(() => window.Konva.stages[1].find('Transformer')[0]?.nodes().length ?? 0);

/** Posição de tela de uma âncora do Transformer. */
async function anchor(page: Page, name: string) {
  return page.evaluate((n) => {
    const ov = window.Konva.stages[1];
    const a = ov.find('Transformer')[0].findOne(`.${n}`);
    const r = ov.container().getBoundingClientRect();
    const p = a.getAbsolutePosition();
    return { x: r.left + p.x, y: r.top + p.y };
  }, name);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

async function ctrlClick(page: Page, p: { x: number; y: number }) {
  await page.keyboard.down('Control');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Control');
}

async function nudge(page: Page, key: 'ArrowUp' | 'ArrowDown', times: number) {
  for (let i = 0; i < times; i++) await page.keyboard.press(`Shift+${key}`);
}

/** Post com 3 textos bem separados na vertical: Texto (topo), Título 1 (meio), Título 2 (base). */
async function setup(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('button[title*="Pronto 1"]').first().click();
  await page.locator('footer button:has-text("Próximo")').click();
  await page.locator('footer button:has-text("Pular (sem enfeites)")').click();
  await page.locator('footer button:has-text("Pular (sem imagem)")').click();
  await page.locator('button:has-text("+ Título")').click(); // t1 no centro
  await page.locator('button:has-text("+ Título")').click(); // t2 (+32)
  await nudge(page, 'ArrowDown', 30);
  await page.locator('button:has-text("+ Texto")').click(); // body
  await nudge(page, 'ArrowUp', 30);
  // Ajusta o body para 75px (próximo ao t2 de 80px) para testar o teto Texto ≤ Título
  const range = page.locator('input[type="range"]');
  await range.fill('75');
  await range.blur();
  const els = await doc(page);
  const body = els.find((e) => e.style === 'body')!;
  const titles = els.filter((e) => e.style !== 'body');
  expect(els).toHaveLength(3);
  // Sai da seleção (Esc) para começar do zero
  await page.keyboard.press('Escape');
  expect(await trCount(page)).toBe(0);
  return { body, t1: titles[0], t2: titles[1] };
}

test.describe('Seleção múltipla (Ctrl + clique)', () => {
  test.skip(({ isMobile }) => isMobile, 'Ctrl+clique é interação de desktop');

  test('seleciona, move, redimensiona, rotaciona, desfaz e exclui em conjunto', async ({ page }) => {
    const { body, t1, t2 } = await setup(page);
    const ids = [body.id, t1.id, t2.id];

    // --- Seleção: clique simples + Ctrl+clique soma/remove ---
    await page.mouse.click(...(Object.values(await screenCenter(page, t1.id)) as [number, number]));
    expect(await trCount(page)).toBe(1);
    await ctrlClick(page, await screenCenter(page, t2.id));
    expect(await trCount(page)).toBe(2);
    await ctrlClick(page, await screenCenter(page, body.id));
    expect(await trCount(page)).toBe(3);
    await expect(page.getByLabel('3 elementos selecionados')).toBeVisible();
    // Ctrl+clique de novo tira da seleção
    await ctrlClick(page, await screenCenter(page, t2.id));
    expect(await trCount(page)).toBe(2);
    await page.waitForTimeout(200);
    await ctrlClick(page, await screenCenter(page, t2.id));
    expect(await trCount(page)).toBe(3);

    // --- Mover em conjunto: mesmo deslocamento para todos (um passo de undo) ---
    const before = await doc(page);
    await drag(page, await screenCenter(page, t1.id), (({ x, y }) => ({ x: x + 40, y: y + 10 }))(await screenCenter(page, t1.id)));
    const moved = await doc(page);
    const delta = (id: string) => {
      const a = before.find((e) => e.id === id)!;
      const b = moved.find((e) => e.id === id)!;
      return { dx: b.x - a.x, dy: b.y - a.y };
    };
    const d1 = delta(t1.id);
    expect(Math.abs(d1.dx) + Math.abs(d1.dy)).toBeGreaterThan(10);
    for (const id of ids) {
      expect(delta(id).dx).toBeCloseTo(d1.dx, 0);
      expect(delta(id).dy).toBeCloseTo(d1.dy, 0);
    }
    expect(await trCount(page)).toBe(3); // seleção preservada após o arraste

    // Undo desfaz o movimento dos três de uma vez
    await page.keyboard.press('Control+z');
    const undone = await doc(page);
    for (const id of ids) {
      expect(undone.find((e) => e.id === id)!.x).toBeCloseTo(before.find((e) => e.id === id)!.x, 1);
      expect(undone.find((e) => e.id === id)!.y).toBeCloseTo(before.find((e) => e.id === id)!.y, 1);
    }
    // O undo pode ter podado/mantido seleção; reseleciona o conjunto
    await page.keyboard.press('Escape');
    await page.mouse.click(...(Object.values(await screenCenter(page, t1.id)) as [number, number]));
    await ctrlClick(page, await screenCenter(page, t2.id));
    await ctrlClick(page, await screenCenter(page, body.id));
    expect(await trCount(page)).toBe(3);

    // --- Redimensionar: proporção entre textos preservada, regra Texto ≤ Título ok ---
    const preScale = await doc(page);
    const br = await anchor(page, 'bottom-right');
    await drag(page, br, { x: br.x + 24, y: br.y + 24 });
    const scaled = await doc(page);
    const size = (list: Persisted[], id: string) => list.find((e) => e.id === id)!.fontSize!;
    const f = size(scaled, t1.id) / size(preScale, t1.id);
    expect(f).toBeGreaterThan(1.02);
    expect(size(scaled, t2.id) / size(preScale, t2.id)).toBeCloseTo(f, 1);
    expect(size(scaled, body.id) / size(preScale, body.id)).toBeCloseTo(f, 1);
    expect(size(scaled, body.id)).toBeLessThanOrEqual(Math.min(size(scaled, t1.id), size(scaled, t2.id)));
    for (const e of scaled) expect(e.scale).toBe(1); // textos sempre scale=1

    // --- Rotacionar: giro rígido (distâncias preservadas), mesma rotação em todos ---
    const preRot = await doc(page);
    const tl = await anchor(page, 'top-left');
    const brA = await anchor(page, 'bottom-right');
    const cx = (tl.x + brA.x) / 2;
    const cy = (tl.y + brA.y) / 2;
    const rot = await anchor(page, 'rotater');
    const R = Math.hypot(rot.x - cx, rot.y - cy);
    const rad = (30 * Math.PI) / 180;
    await drag(page, rot, { x: cx + R * Math.sin(rad), y: cy - R * Math.cos(rad) });
    const rotated = await doc(page);
    const dist = (list: Persisted[], a: string, b: string) => {
      const A = list.find((e) => e.id === a)!;
      const B = list.find((e) => e.id === b)!;
      return Math.hypot(A.x - B.x, A.y - B.y);
    };
    expect(dist(rotated, t1.id, t2.id)).toBeCloseTo(dist(preRot, t1.id, t2.id), 0);
    expect(dist(rotated, t1.id, body.id)).toBeCloseTo(dist(preRot, t1.id, body.id), 0);
    const r1 = rotated.find((e) => e.id === t1.id)!.rotation;
    expect(Math.abs(r1)).toBeGreaterThan(10);
    for (const id of ids) expect(rotated.find((e) => e.id === id)!.rotation).toBeCloseTo(r1, 1);

    // --- Excluir em conjunto + undo ---
    await page.keyboard.press('Delete');
    expect(await doc(page)).toHaveLength(0);
    await page.keyboard.press('Control+z');
    expect(await doc(page)).toHaveLength(3);
  });

  test('Ctrl+clique no vazio preserva a seleção; clique simples no vazio limpa', async ({ page }) => {
    const { t1, t2 } = await setup(page);
    await page.mouse.click(...(Object.values(await screenCenter(page, t1.id)) as [number, number]));
    await ctrlClick(page, await screenCenter(page, t2.id));
    expect(await trCount(page)).toBe(2);
    // canto da folha (vazio)
    const sheet = await page.evaluate(() => document.querySelector('[class*=sheetClip]')!.getBoundingClientRect().toJSON());
    const empty = { x: sheet.left + 6, y: sheet.top + 6 };
    await ctrlClick(page, empty);
    expect(await trCount(page)).toBe(2);
    await page.mouse.click(empty.x, empty.y);
    expect(await trCount(page)).toBe(0);
  });

  test('Texto ≤ Título: escalar corpo+título acima do limite trava e avisa', async ({ page }) => {
    const { body, t1, t2 } = await setup(page);
    // Seleciona só o corpo e o título 1: o título 2 (fora) limita o corpo
    await page.mouse.click(...(Object.values(await screenCenter(page, t1.id)) as [number, number]));
    await ctrlClick(page, await screenCenter(page, body.id));
    expect(await trCount(page)).toBe(2);
    const pre = await doc(page);
    const br = await anchor(page, 'bottom-right');
    await drag(page, br, { x: br.x + 300, y: br.y + 300 });
    const post = await doc(page);
    const sz = (list: Persisted[], id: string) => list.find((e) => e.id === id)!.fontSize!;
    // O corpo nunca passa do menor título (o título 2, fora da seleção, não mudou)
    expect(sz(post, t2.id)).toBe(sz(pre, t2.id));
    expect(sz(post, body.id)).toBeLessThanOrEqual(sz(post, t2.id));
    await expect(page.getByText('Opa! O texto não pode ficar maior que o título')).toBeVisible();
  });
});

import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Konva: any;
  }
}

/** Lê dimensões (largura e altura) do cabeçalho IHDR de um arquivo PNG. */
function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  // PNG signature = 8 bytes; IHDR chunk data begins at byte 16 (width: 4 bytes, height: 4 bytes)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function getDocFormat(page: Page) {
  return page.evaluate(() => {
    const ed = (window as any).__useEditor;
    return ed?.getState().doc.format;
  });
}

async function getBackgroundOffsetY(page: Page) {
  return page.evaluate(() => {
    const ed = (window as any).__useEditor;
    return ed?.getState().doc.backgroundOffsetY;
  });
}

async function isBackgroundInteractive(page: Page) {
  return page.evaluate(() => {
    const stage = window.Konva.stages[0];
    const bgImage = stage.findOne('Image');
    return bgImage ? (bgImage.draggable() && bgImage.listening()) : false;
  });
}

test.describe('Formatos de Post (3:4, 4:3 e 1:1)', () => {
  test('troca de formato e valida proporção da folha', async ({ page }) => {
    await page.goto('/');

    // 1. Inicia em 3:4 padrão
    await expect(page.locator('button:has-text("Vertical (3:4)")')).toBeVisible();
    expect(await getDocFormat(page)).toBe('3:4');

    // 2. Alterna para 4:3 (Horizontal)
    await page.locator('button:has-text("Horizontal (4:3)")').click();
    expect(await getDocFormat(page)).toBe('4:3');

    // Verifica que a largura da folha é maior que a altura
    const frameBox43 = await page.locator('[class*=canvasFrame]').boundingBox();
    expect(frameBox43).not.toBeNull();
    expect(frameBox43!.width).toBeGreaterThan(frameBox43!.height);

    // 3. Alterna para 1:1 (Quadrado)
    await page.locator('button:has-text("Quadrado (1:1)")').click();
    expect(await getDocFormat(page)).toBe('1:1');

    // Verifica que a folha é perfeitamente quadrada
    const frameBox11 = await page.locator('[class*=canvasFrame]').boundingBox();
    expect(frameBox11).not.toBeNull();
    expect(Math.round(frameBox11!.width)).toBe(Math.round(frameBox11!.height));
  });

  test('formato 1:1: corte vertical por botões rápidos e slider', async ({ page }) => {
    await page.goto('/');

    // Escolhe formato 1:1
    await page.locator('button:has-text("Quadrado (1:1)")').click();
    expect(await getDocFormat(page)).toBe('1:1');

    // Seleciona o primeiro fundo
    const firstThumb = page.locator('button[class*="item"]').first();
    await firstThumb.click();

    // Painel de opções do fundo exibe controles de corte vertical
    await expect(page.locator('text=Corte vertical')).toBeVisible();
    const topBtn = page.locator('button:has-text("Topo")');
    const centerBtn = page.locator('button:has-text("Centro")');
    const baseBtn = page.locator('button:has-text("Base")');

    await expect(topBtn).toBeVisible();
    await expect(centerBtn).toBeVisible();
    await expect(baseBtn).toBeVisible();

    // Inicialmente no centro (180)
    expect(await getBackgroundOffsetY(page)).toBe(180);

    // Clica em Topo (offset 0)
    await topBtn.click();
    expect(await getBackgroundOffsetY(page)).toBe(0);

    // Clica em Base (offset 360)
    await baseBtn.click();
    expect(await getBackgroundOffsetY(page)).toBe(360);

    // Clica em Centro (offset 180)
    await centerBtn.click();
    expect(await getBackgroundOffsetY(page)).toBe(180);

    // Altera o slider diretamente
    const slider = page.locator('input[type="range"]');
    await slider.fill('90');
    expect(await getBackgroundOffsetY(page)).toBe(90);
  });

  test('deslize do fundo ativado no Passo 1 e estritamente travado fora dele', async ({ page }) => {
    await page.goto('/');

    // Formato 1:1 e fundo selecionado
    await page.locator('button:has-text("Quadrado (1:1)")').click();
    await page.locator('button[class*="item"]').first().click();

    // No Passo 1 (step === 0), o fundo é interativo (draggable e listening)
    expect(await isBackgroundInteractive(page)).toBe(true);

    // Avança para o Passo 2: Enfeites
    await page.locator('footer button:has-text("Próximo")').click();
    await expect(page.locator('h2')).toContainText('2. Enfeita aí');

    // Fora do Passo 1, o fundo NÃO é interativo nem listening
    expect(await isBackgroundInteractive(page)).toBe(false);

    // Volta para o Passo 1
    await page.locator('button:has-text("1. Fundo")').click();
    await expect(page.locator('h2')).toContainText('1. Escolha o fundo');

    // No Passo 1, o fundo volta a ser interativo
    expect(await isBackgroundInteractive(page)).toBe(true);
  });

  test('exportação no formato 1:1 gera PNG exatamente 1080×1080', async ({ page }) => {
    await page.goto('/');

    // Seleciona formato 1:1 e um fundo
    await page.locator('button:has-text("Quadrado (1:1)")').click();
    await page.locator('button[class*="item"]').first().click();

    // Dispara o download
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button[aria-label*="Baixar post"]').first().click();
    const download = await downloadPromise;

    // Salva temporariamente e verifica dimensões
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const { width, height } = readPngDimensions(downloadPath!);

    expect(width).toBe(1080);
    expect(height).toBe(1080);
  });
});

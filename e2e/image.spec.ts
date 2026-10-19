import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'foto.png');

test.describe('Etapa 3 - Imagens do usuário', () => {
  test('upload, transformações, limite de 5 e export', async ({ page }) => {
    await page.goto('/');

    // Fundo obrigatório → Enfeites
    await page.locator('button[title*="Pronto 1"]').first().click();
    await page.locator('footer button:has-text("Próximo")').click();

    // Etapa 3: Imagem
    await page.locator('footer button:has-text("Pular (sem enfeites)")').click();
    await expect(page.locator('h2')).toContainText('3. Sua imagem');
    await expect(page.locator('text=0 de 5')).toBeVisible();

    // Upload via seletor
    const addInput = page.locator('input[type="file"]').first();
    await addInput.setInputFiles(FIXTURE);
    await expect(page.locator('text=Na folha (1/5)')).toBeVisible();

    // A imagem entra selecionada e o card de opções aparece
    await expect(page.getByText('Imagem Selecionada')).toBeVisible();

    // Espelha horizontal e verticalmente (estado dos botões: regra do DecorationNode-style flip)
    await page.locator('button:has-text("Espelhar ↔")').click();
    await page.locator('button:has-text("Espelhar ↕")').click();

    // A gravação no histórico de undo agrupa mudanças a cada ~400ms:
    // espera a janela passar para que remover/voltar enregistre states distintos.
    await page.waitForTimeout(450);

    // Remove e volta com undo (sem imagens a lista nem é renderizada)
    await page.getByRole('button', { name: 'Remover imagem selecionada' }).click();
    await expect(page.locator('text=Na folha (1/5)')).toHaveCount(0);
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    await expect(page.locator('text=Na folha (1/5)')).toBeVisible();

    // O undo volta sem seleção: seleciona na lista para reabrir o card
    await page.locator('button[title="foto"]').click();
    await expect(page.getByText('Imagem Selecionada')).toBeVisible();

    // Reordena camadas sem erro
    await page.locator('button:has-text("Trazer pra frente")').click();
    await page.locator('button:has-text("Enviar pra trás")').click();

    // Enche a folha até o limite de 5
    for (let i = 2; i <= 5; i++) {
      await addInput.setInputFiles(FIXTURE);
      await expect(page.locator(`text=Na folha (${i}/5)`)).toBeVisible();
    }
    await expect(page.locator('text=Folha cheia de imagens!')).toBeVisible();

    // A 6ª é bloqueada com toast amigável
    await addInput.setInputFiles(FIXTURE);
    await expect(page.locator('text=Tá lotado! Cabem até 5 imagens por post 😅')).toBeVisible();

    // Export com imagens na folha
    await page.getByRole('button', { name: /6\. Textura/ }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button[aria-label*="Baixar post"]').first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^cuscuz-post-\d{4}-\d{2}-\d{2}-\d{4}\.png$/);
    await expect(page.locator('text=Post salvo com sucesso!')).toBeVisible();
  });

  test('solta arquivo direto na folha e importa na posição do cursor', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[title*="Pronto 1"]').first().click();
    await page.locator('footer button:has-text("Próximo")').click();
    await page.locator('footer button:has-text("Pular (sem enfeites)")').click();
    await expect(page.locator('h2')).toContainText('3. Sua imagem');

    // Monta o DataTransfer com a fixture dentro do contexto da página
    const png = await fs.readFile(FIXTURE);
    const dataTransfer = await page.evaluateHandle((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'foto.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt;
    }, png.toString('base64'));

    // drop direto na área da folha (o evento "dragenter/dragover" já é
    // repassado pelo guard global: sem preventDefault não havia drop)
    const folha = page.locator('[aria-label="Folha de criação"]').locator('div').first();
    await folha.dispatchEvent('drop', { dataTransfer });

    // Importou para o doc e está na lista
    await expect(page.locator('text=Na folha (1/5)')).toBeVisible();
    // Navegação guardada: ainda na página do app
    expect(page.url()).not.toContain('blob:');
  });
});

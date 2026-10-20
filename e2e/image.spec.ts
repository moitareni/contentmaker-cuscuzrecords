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

  test('remover fundo: quadro fixo, clique fora não fecha e zero download', async ({ page }) => {
    // O modelo só pode ser baixado quando um tipo é escolhido — este teste
    // valida a UI sem tocar na rede.
    const hfRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('huggingface')) hfRequests.push(req.url());
    });

    await page.goto('/');
    await page.locator('button[title*="Pronto 1"]').first().click();
    await page.locator('footer button:has-text("Próximo")').click();
    await page.locator('footer button:has-text("Pular (sem enfeites)")').click();
    await expect(page.locator('h2')).toContainText('3. Sua imagem');

    const addInput = page.locator('input[type="file"]').first();
    await addInput.setInputFiles(FIXTURE);
    await expect(page.locator('text=Na folha (1/5)')).toBeVisible();

    // Botão do card abre o quadro — que nasce NO LUGAR do botão
    await page.getByRole('button', { name: 'Remover fundo', exact: true }).click();
    const panel = page.getByRole('group', { name: 'Remover fundo' });
    await expect(panel).toContainText('Escolha o tipo de recorte pra “foto”');
    await expect(page.getByRole('button', { name: 'Pessoa' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Objeto' })).toBeVisible();
    // O quadro substituiu o botão dentro do card
    await expect(page.getByRole('button', { name: 'Remover fundo', exact: true })).toHaveCount(0);

    // Nota da primeira vez (modelo ainda não baixado)
    await expect(panel).toContainText('uma vez só e guardamos no navegador');

    // Clicar na folha deseleciona a imagem, mas o quadro NÃO fecha: só o X fecha.
    // (A folha são N canvas de layers Konva empilhados; a de baixo não recebe
    // pointer-events, então o clique é físico por coordenadas.)
    const canvasBox = await page
      .locator('section[aria-label="Folha de criação"] canvas')
      .first()
      .boundingBox();
    await page.mouse.click(canvasBox.x + 24, canvasBox.y + 24);
    await expect(page.getByText('Imagem Selecionada')).toHaveCount(0);
    await expect(panel).toBeVisible();

    // X fecha sem escolher nada
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(panel).toHaveCount(0);

    // Tesourinha da lista reabre o quadro no slot; X fecha
    await page.getByRole('button', { name: 'Remover fundo de foto' }).click();
    await expect(panel).toContainText('Escolha o tipo de recorte');
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(panel).toHaveCount(0);

    // Nenhum tipo escolhido: nada do modelo passou pela rede
    expect(hfRequests).toEqual([]);
  });
});

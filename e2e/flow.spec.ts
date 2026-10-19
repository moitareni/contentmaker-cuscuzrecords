import { test, expect } from '@playwright/test';

test.describe('Cuscuz Records Insta Kit - Fluxo Completo', () => {
  test('cria um post completo e valida as regras da marca', async ({ page }) => {
    // 1. Abre o app
    await page.goto('/');
    await expect(page).toHaveTitle(/Cuscuz Records Insta Kit/);

    // 2. Passo 1: Fundo
    // Inicialmente, sem fundo selecionado, o botão Próximo deve estar desabilitado
    const nextBtn = page.locator('footer button:has-text("Próximo")');
    await expect(nextBtn).toBeDisabled();

    // Seleciona o primeiro fundo pronto
    const firstBg = page.locator('button[title*="Pronto 1"]').first();
    await firstBg.click();
    await expect(nextBtn).toBeEnabled();

    // Avança para o Passo 2: Enfeites
    await nextBtn.click();
    await expect(page.locator('h2')).toContainText('2. Enfeita aí!');

    // Como nenhum enfeite foi adicionado ainda, o botão deve indicar que é opcional
    const skipBtn = page.locator('footer button:has-text("Pular (sem enfeites)")');
    await expect(skipBtn).toBeVisible();

    // Adiciona um enfeite (Flores)
    const floresBtn = page.locator('button[title*="Flores"]').first();
    await floresBtn.click();

    // Agora o botão muda para "Próximo"
    await expect(page.locator('footer button:has-text("Próximo")')).toBeVisible();

    // Testa o posicionamento rápido no canto inferior esquerdo
    const blBtn = page.locator('button:has-text("Inferior Esq.")');
    await expect(blBtn).toBeVisible();
    await blBtn.click();

    // Avança para o Passo 3: Imagem
    await page.locator('footer button:has-text("Próximo")').click();
    await expect(page.locator('h2')).toContainText('3. Sua imagem');

    // Etapa opcional: pula sem imagem
    const skipImageBtn = page.locator('footer button:has-text("Pular (sem imagem)")');
    await expect(skipImageBtn).toBeVisible();
    await skipImageBtn.click();
    await expect(page.locator('h2')).toContainText('4. Escreve aí');

    // Adiciona um título (Londrina Black)
    await page.locator('button:has-text("+ Título")').click();

    // Altera o texto do título
    const textarea = page.locator('textarea[placeholder="Digite o texto aqui..."]');
    await textarea.fill('LANÇAMENTO');

    // Adiciona um texto normal (PT Sans Narrow)
    await page.locator('button:has-text("+ Texto")').click();

    // Verifica que a regra do texto não exceder o título está ativa
    // O slider do texto deve ter o marcador de limite
    const limitLegend = page.locator('text=Máx permitido pelo título:');
    await expect(limitLegend).toBeVisible();

    // Avança para o Passo 5: Logo
    await page.locator('footer button:has-text("Próximo")').click();
    await expect(page.locator('h2')).toContainText('5. Carimba a logo');

    // Logo é opcional: adiciona com papel
    await page.locator('button:has-text("Adicionar Logo com Papel")').click();

    // Alterna para tamanho P (nome acessível exato: "opcional" da barra de
    // etapas contém "p", então substring solta pega o botão errado)
    await page.getByRole('button', { name: 'P', exact: true }).click();

    // Posiciona no Centro Inferior
    await page.locator('button:has-text("Centro Inferior")').click();

    // Passo 6: acabamento é opcional e vem desligado por padrão (regra da marca)
    await page.locator('footer button:has-text("Próximo")').click();
    await expect(page.locator('h2')).toContainText('6. Textura');
    await expect(page.locator('button:has-text("Papel (Desligado)")')).toBeVisible();
    await expect(page.locator('button:has-text("Grain (Desligado)")')).toBeVisible();

    // Liga o acabamento recomendado (papel + grain) antes de exportar
    await page.locator('button:has-text("Papel (Desligado)")').click();
    await page.locator('button:has-text("Grain (Desligado)")').click();
    await expect(page.locator('button:has-text("Papel (Ligado)")')).toBeVisible();
    await expect(page.locator('button:has-text("Grain (Ligado)")')).toBeVisible();

    // Dispara a exportação e captura o download (botão único no dock lateral)
    const downloadPromise = page.waitForEvent('download');
    await page.locator('button[aria-label*="Baixar post"]').first().click();
    const download = await downloadPromise;

    // Valida o nome do arquivo baixado
    expect(download.suggestedFilename()).toMatch(/^cuscuz-post-\d{4}-\d{2}-\d{2}-\d{4}\.png$/);

    // Valida que o toast de sucesso apareceu
    await expect(page.locator('text=Post salvo com sucesso!')).toBeVisible();
  });
});

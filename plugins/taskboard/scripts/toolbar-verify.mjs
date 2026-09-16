import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const npmRoot = execFileSync('npm', ['root', '--global'], {
  encoding: 'utf8'
}).trim();
const { chromium } = await import(
  pathToFileURL(join(npmRoot, 'playwright', 'index.mjs')).href
);
const baseUrl = process.env.BB_SERVER_URL ?? 'http://127.0.0.1:38886';
const projectId = process.argv[2] ?? 'proj_iu2ivecrkf';
const outDir = '.empirical/evidence/toolbar-chips';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });
  await page.goto(`${baseUrl}/plugins/taskboard/tasks/${projectId}`, {
    waitUntil: 'domcontentloaded'
  });
  await page.locator('.tb-item-row').first().waitFor({
    state: 'visible',
    timeout: 20_000
  });

  // Distinct projects present in the loaded data (from the row marks).
  const projects = await page
    .locator('.tb-project-mark')
    .allInnerTexts();
  const distinctProjects = [...new Set(projects.map(t => t.trim()))];

  // Switch to Kanban where the toolbar lives.
  await page.getByText('Kanban', { exact: true }).first().click();
  await page.locator('.tb-kanban-card').first().waitFor({
    state: 'visible',
    timeout: 15_000
  });

  const toolbar = page.locator('.tb-epic-fold-toolbar');
  const toolbarVisible = (await toolbar.count()) > 0;
  const toggle = toolbarVisible
    ? toolbar.locator('button', { hasText: /all/u }).first()
    : null;
  const toggleLabel = toggle ? (await toggle.innerText()).trim() : null;
  const toggleCount = toolbarVisible
    ? await toolbar
        .locator('button')
        .filter({ hasText: /Expand all|Collapse all/u })
        .count()
    : 0;
  const chips = toolbarVisible
    ? await toolbar.locator('button[aria-pressed]').allInnerTexts()
    : [];
  const cardCount = await page.locator('.tb-kanban-card').count();
  await page.screenshot({ path: `${outDir}/toolbar-kanban.png` });

  // If chips exist, click the first and verify the board filters down.
  let afterClick = null;
  if (chips.length > 0) {
    await toolbar.locator('button[aria-pressed]').first().click();
    await page.waitForTimeout(800);
    const pressed = await toolbar
      .locator('button[aria-pressed="true"]')
      .allInnerTexts();
    afterClick = {
      cardCount: await page.locator('.tb-kanban-card').count(),
      pressedChips: pressed.map(t => t.trim()),
      markProjects: [
        ...new Set(
          (await page.locator('.tb-project-mark').allInnerTexts()).map(t =>
            t.trim()
          )
        )
      ]
    };
    await page.screenshot({ path: `${outDir}/toolbar-chip-active.png` });
    // Click again to clear.
    await toolbar.locator('button[aria-pressed="true"]').first().click();
    await page.waitForTimeout(800);
    afterClick.afterClear = {
      cardCount: await page.locator('.tb-kanban-card').count(),
      pressedChips: await toolbar
        .locator('button[aria-pressed="true"]')
        .count()
    };
  }

  process.stdout.write(
    `${JSON.stringify({
      projectId,
      distinctProjects,
      toolbarVisible,
      toggleCount,
      toggleLabel,
      chips: chips.map(t => t.trim()),
      cardCount,
      afterClick
    })}\n`
  );
} finally {
  await browser.close();
}

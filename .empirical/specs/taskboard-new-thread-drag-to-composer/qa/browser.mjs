import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const npmRoot = execFileSync('npm', ['root', '--global'], {
  encoding: 'utf8'
}).trim();
const { chromium } = await import(
  pathToFileURL(join(npmRoot, 'playwright', 'index.mjs')).href
);
const baseUrl = process.env.BB_SERVER_URL ?? 'http://127.0.0.1:38886';

function screenshotRoot() {
  const claimsDir = '.git/empirical/claims';
  const cwd = process.cwd();
  if (existsSync(claimsDir)) {
    for (const file of readdirSync(claimsDir)) {
      try {
        const claim = JSON.parse(readFileSync(join(claimsDir, file), 'utf8'));
        if (claim.worktree === cwd && typeof claim.feature === 'string') {
          const dir = `.empirical/specs/${claim.feature}/qa`;
          mkdirSync(dir, { recursive: true });
          return dir;
        }
      } catch {
        // Ignore unreadable claim files.
      }
    }
  }
  const dir = '.empirical/evidence/taskboard-browser';
  mkdirSync(dir, { recursive: true });
  return dir;
}

function projectWithWorkItems() {
  const projects = JSON.parse(
    execFileSync('bb', ['project', 'list', '--json'], { encoding: 'utf8' })
  );
  for (const project of projects) {
    try {
      const listed = execFileSync(
        'bb',
        ['taskboard', 'list', '--project', project.id],
        { encoding: 'utf8', timeout: 30_000 }
      );
      if (listed.trim().length > 0) return project.id;
    } catch {
      // Project has no configured taskboard source.
    }
  }
  throw new Error('No bb project has taskboard work items to verify against');
}

const projectId = projectWithWorkItems();
const outDir = screenshotRoot();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });
  await page.goto(`${baseUrl}/plugins/taskboard/tasks/${projectId}`, {
    waitUntil: 'domcontentloaded'
  });
  const firstRow = page.locator('.tb-item-row').first();
  await firstRow.waitFor({ state: 'visible', timeout: 20_000 });

  const rowCount = await page.locator('.tb-item-row').count();
  const markCount = await page.locator('.tb-item-row .tb-project-mark').count();
  if (markCount < 1) {
    throw new Error(`List view rendered ${rowCount} rows but no project mark`);
  }
  const mark = page.locator('.tb-item-row .tb-project-mark').first();
  const markText = (await mark.innerText()).trim();
  if (markText.length === 0) {
    throw new Error('Project mark rendered without any project name text');
  }
  const iconHidden = await mark
    .locator('svg[aria-hidden="true"], [aria-hidden="true"] svg')
    .count();
  if (iconHidden < 1) {
    throw new Error('Project mark icon is not aria-hidden');
  }
  const pillClasses = await mark.evaluate((el) =>
    ['tb-label-chip', 'rounded-full', 'border', 'bg-'].some((c) =>
      (el.getAttribute('class') ?? '').includes(c)
    )
  );
  if (pillClasses) {
    throw new Error('Project mark uses pill/chip styling instead of ghost text');
  }
  const label =
    (await firstRow
      .locator('button[aria-label]')
      .first()
      .getAttribute('aria-label')) ?? '';
  const labelText = markText.replace(/…$/, '').slice(0, 12);
  if (!label.includes(labelText)) {
    throw new Error(`Row aria-label "${label}" does not name project "${markText}"`);
  }
  await page.screenshot({ path: `${outDir}/project-chip-list.png` });

  await page.getByText('Kanban', { exact: true }).first().click();
  const firstCard = page.locator('.tb-kanban-card').first();
  await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
  const cardMarkCount = await page
    .locator('.tb-kanban-card .tb-project-mark')
    .count();
  if (cardMarkCount < 1) {
    throw new Error('Kanban view rendered cards but no project mark');
  }
  await page.screenshot({ path: `${outDir}/project-chip-kanban.png` });

  process.stdout.write(
    `${JSON.stringify({
      projectId,
      listRows: rowCount,
      listProjectMarks: markCount,
      kanbanProjectMarks: cardMarkCount,
      sampleProject: markText,
      screenshots: [
        `${outDir}/project-chip-list.png`,
        `${outDir}/project-chip-kanban.png`
      ]
    })}\n`
  );
} finally {
  await browser.close();
}

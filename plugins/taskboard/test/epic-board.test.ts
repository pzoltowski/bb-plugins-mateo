import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const sourceUrl = new URL(
        `${specifier.slice(0, -'.js'.length)}.ts`,
        context.parentURL
      );
      if (existsSync(fileURLToPath(sourceUrl))) {
        return { shortCircuit: true, url: sourceUrl.href };
      }
    }
    return nextResolve(specifier, context);
  }
});

const [board, projects] = await Promise.all([
  import('../epic-board.ts'),
  import('../sources/github-projects.ts')
]);
const {
  epicChildTitle,
  epicProgressLabel,
  epicProgressPercent,
  foldedBoardItems,
  isFoldedChild,
  labelChipTone,
  pullRequestFooterText,
  shortItemReference,
  supportsEpicFolding
} = board;
const { buildEpicIndex, pickPullRequest } = projects;

type WorkItem = Parameters<typeof foldedBoardItems>[0][number];

const REPO = 'pzoltowski/mock-highgui-github';

function item(
  number: number,
  overrides: Partial<WorkItem> = {}
): WorkItem {
  return {
    bbProjectId: 'proj_test',
    source: 'github',
    locator: `${REPO}#${number}`,
    key: `${REPO}#${number}`,
    title: `Issue ${number}`,
    description: '',
    url: `https://github.com/${REPO}/issues/${number}`,
    status: 'Backlog',
    stateCategory: 'backlog',
    priority: null,
    assignee: null,
    project: REPO,
    labels: [],
    updatedAt: '2026-09-08T10:00:00Z',
    epic: null,
    ...overrides
  } as WorkItem;
}

function epic(overrides: Partial<NonNullable<WorkItem['epic']>> = {}) {
  return {
    parentKey: null,
    children: [],
    completedChildren: 0,
    totalChildren: 0,
    pullRequest: null,
    ...overrides
  };
}

test('folding keeps only items whose parent is not on the board', () => {
  const items = [
    item(10, { epic: epic({ totalChildren: 2 }) }),
    item(11, { epic: epic({ parentKey: `${REPO}#10` }) }),
    item(12, { epic: epic({ parentKey: `${REPO}#10` }) }),
    // Orphan: its parent is not among the visible items.
    item(30, { epic: epic({ parentKey: `${REPO}#99` }) }),
    // A plain item from a tracker without a hierarchy.
    item(8)
  ];
  assert.deepEqual(
    foldedBoardItems(items, true).map(entry => entry.locator),
    [`${REPO}#10`, `${REPO}#30`, `${REPO}#8`]
  );
  assert.equal(
    isFoldedChild(items[1]!, new Set(items.map(entry => entry.locator))),
    true
  );
  assert.equal(
    isFoldedChild(items[3]!, new Set(items.map(entry => entry.locator))),
    false
  );
});

test('folding off, or a tracker with no hierarchy, changes nothing', () => {
  const items = [
    item(10, { epic: epic({ totalChildren: 1 }) }),
    item(11, { epic: epic({ parentKey: `${REPO}#10` }) })
  ];
  assert.equal(foldedBoardItems(items, false), items);
  const flat = [item(1), item(2)];
  assert.equal(foldedBoardItems(flat, true), flat);
  assert.equal(supportsEpicFolding(flat), false);
  assert.equal(supportsEpicFolding(items), true);
});

test('progress reads completed over total children', () => {
  assert.equal(
    epicProgressLabel(epic({ completedChildren: 2, totalChildren: 6 })),
    '2 / 6 children'
  );
  assert.equal(
    epicProgressPercent(epic({ completedChildren: 2, totalChildren: 6 })),
    33
  );
  assert.equal(
    epicProgressPercent(epic({ completedChildren: 5, totalChildren: 5 })),
    100
  );
  assert.equal(
    epicProgressPercent(epic({ completedChildren: 0, totalChildren: 0 })),
    0
  );
});

test('the PR footer reads number, state and branch', () => {
  assert.equal(
    pullRequestFooterText({
      number: 17,
      state: 'draft',
      branch: 'feat/timeline'
    }),
    'PR #17 · draft · feat/timeline'
  );
  assert.equal(
    pullRequestFooterText({
      number: 7,
      state: 'merged',
      branch: 'feat/minimap'
    }),
    'PR #7 · merged · feat/minimap'
  );
});

test('an open pull request outranks a merged one', () => {
  assert.deepEqual(
    pickPullRequest([
      { number: 7, isDraft: false, state: 'MERGED', headRefName: 'feat/a' },
      { number: 17, isDraft: true, state: 'OPEN', headRefName: 'feat/b' }
    ]),
    { number: 17, state: 'draft', branch: 'feat/b' }
  );
  assert.deepEqual(
    pickPullRequest([
      { number: 7, isDraft: false, state: 'MERGED', headRefName: 'feat/a' }
    ]),
    { number: 7, state: 'merged', branch: 'feat/a' }
  );
  assert.equal(pickPullRequest([]), null);
});

test('child titles drop the epic prefix and keep their own number', () => {
  assert.equal(
    epicChildTitle('Timeline: pure C seams — snap', 'Timeline: time domain'),
    'pure C seams — snap'
  );
  assert.equal(
    epicChildTitle('Unrelated title', 'Timeline: time domain'),
    'Unrelated title'
  );
  assert.equal(shortItemReference(`${REPO}#12`), '#12');
  assert.equal(shortItemReference('TASK-42'), 'TASK-42');
});

test('label chips are grouped by label family', () => {
  assert.equal(labelChipTone('type:epic'), 'type');
  assert.equal(labelChipTone('area:inspector'), 'area');
  assert.equal(labelChipTone('type:bug'), 'bug');
  assert.equal(labelChipTone('bug'), 'bug');
  assert.equal(labelChipTone('type:decision'), 'decision');
  assert.equal(labelChipTone('needs-triage'), 'neutral');
});

test('the epic index nests children and prefers GitHub sub-issue counts', () => {
  const index = buildEpicIndex([
    {
      locator: `${REPO}#10`,
      title: 'Timeline',
      closed: false,
      parentLocator: null,
      subIssues: { total: 6, completed: 2 },
      pullRequest: { number: 17, state: 'draft', branch: 'feat/timeline' }
    },
    {
      locator: `${REPO}#12`,
      title: 'Timeline: ruler',
      closed: true,
      parentLocator: `${REPO}#10`,
      subIssues: null,
      pullRequest: null
    },
    {
      locator: `${REPO}#11`,
      title: 'Timeline: pure C seams',
      closed: true,
      parentLocator: `${REPO}#10`,
      subIssues: null,
      pullRequest: null
    },
    {
      locator: `${REPO}#30`,
      title: 'Child of an invisible parent',
      closed: false,
      parentLocator: `${REPO}#99`,
      subIssues: null,
      pullRequest: null
    }
  ]);
  const parent = index.get(`${REPO}#10`)!;
  assert.equal(parent.parentKey, null);
  // Children are listed in issue-number order, not board order.
  assert.deepEqual(
    parent.children.map(child => child.key),
    [`${REPO}#11`, `${REPO}#12`]
  );
  assert.deepEqual(
    parent.children.map(child => child.closed),
    [true, true]
  );
  // GitHub knows about 6 children; only 2 are on the board.
  assert.equal(parent.totalChildren, 6);
  assert.equal(parent.completedChildren, 2);
  assert.deepEqual(parent.pullRequest, {
    number: 17,
    state: 'draft',
    branch: 'feat/timeline'
  });
  assert.equal(index.get(`${REPO}#11`)!.parentKey, `${REPO}#10`);
  // An unresolvable parent is dropped so the child stays a top-level card.
  assert.equal(index.get(`${REPO}#30`)!.parentKey, null);
});

test('the epic index falls back to visible children when GitHub reports none', () => {
  const index = buildEpicIndex([
    {
      locator: `${REPO}#20`,
      title: 'Mobile arc',
      closed: false,
      parentLocator: null,
      subIssues: null,
      pullRequest: null
    },
    {
      locator: `${REPO}#21`,
      title: 'Mobile arc: fabric',
      closed: false,
      parentLocator: `${REPO}#20`,
      subIssues: null,
      pullRequest: null
    }
  ]);
  const parent = index.get(`${REPO}#20`)!;
  assert.equal(parent.totalChildren, 1);
  assert.equal(parent.completedChildren, 0);
});

test('the Kanban card renders progress, children and the PR footer', async () => {
  const app = await readFile(new URL('../app.tsx', import.meta.url), 'utf8');
  const card = app.match(/function KanbanCard\(\{[\s\S]*?\nfunction KanbanBoard/u)?.[0];
  assert.ok(card, 'Missing KanbanCard');
  assert.match(card, /role="progressbar"/u);
  assert.match(card, /epicProgressLabel\(epic\)/u);
  assert.match(card, /pullRequestFooterText\(epic\.pullRequest\)/u);
  assert.match(card, /data-chip-tone=\{labelChipTone\(label\)\}/u);
  assert.match(card, /<EpicChildList item=\{item\} listId=\{listId\}/u);

  const list = app.match(/function EpicChildList\(\{[\s\S]*?\nfunction KanbanCard/u)?.[0];
  assert.ok(list, 'Missing EpicChildList');
  assert.match(list, /aria-expanded=\{expanded\}/u);
  assert.match(list, /data-child-state=\{child\.closed \? 'closed' : 'open'\}/u);

  const board = app.match(/function KanbanBoard[\s\S]*?\nfunction TrackerList/u)?.[0];
  assert.ok(board, 'Missing KanbanBoard');
  assert.match(board, /foldedBoardItems\(allItems, foldChildren\)/u);
});

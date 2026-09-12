import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { WorkItemChild } from '../contract.js';

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

const [board, projects, epicIndex] = await Promise.all([
  import('../epic-board.ts'),
  import('../sources/github-projects.ts'),
  import('../sources/epic-index.ts')
]);
const {
  cardReference,
  chipLabelText,
  epicChildCategory,
  epicChildTitle,
  epicChildTone,
  epicChildrenNeedingYou,
  workItemNeedsYou,
  epicProgressLabel,
  epicProgressPercent,
  foldedBoardItems,
  isFoldedChild,
  labelChipTone,
  pullRequestFooterText,
  shortItemReference,
  singleRepositoryBoard,
  supportsEpicFolding,
  visibleChipLabels
} = board;
const { pickPullRequest } = projects;
const { buildEpicIndex } = epicIndex;

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
      key: `${REPO}#10`,
      title: 'Timeline',
      url: `https://github.com/${REPO}/issues/10`,
      closed: false,
      status: 'Working',
      parentLocator: null,
      subIssues: { total: 6, completed: 2 },
      pullRequest: { number: 17, state: 'draft', branch: 'feat/timeline' },
      sortOrder: 10
    },
    {
      locator: `${REPO}#12`,
      key: `${REPO}#12`,
      title: 'Timeline: ruler',
      url: `https://github.com/${REPO}/issues/12`,
      closed: true,
      status: 'Done',
      parentLocator: `${REPO}#10`,
      subIssues: null,
      pullRequest: null,
      sortOrder: 12
    },
    {
      locator: `${REPO}#11`,
      key: `${REPO}#11`,
      title: 'Timeline: pure C seams',
      url: `https://github.com/${REPO}/issues/11`,
      closed: true,
      status: 'Done',
      parentLocator: `${REPO}#10`,
      subIssues: null,
      pullRequest: null,
      sortOrder: 11
    },
    {
      locator: `${REPO}#30`,
      key: `${REPO}#30`,
      title: 'Child of an invisible parent',
      url: `https://github.com/${REPO}/issues/30`,
      closed: false,
      status: 'Needs-you',
      parentLocator: `${REPO}#99`,
      subIssues: null,
      pullRequest: null,
      sortOrder: 30
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
  // The board column each child sits in reaches the card, not just open/closed.
  assert.deepEqual(
    parent.children.map(child => child.status),
    ['Done', 'Done']
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
      key: `${REPO}#20`,
      title: 'Mobile arc',
      url: `https://github.com/${REPO}/issues/20`,
      closed: false,
      status: 'Ready',
      parentLocator: null,
      subIssues: null,
      pullRequest: null,
      sortOrder: 20
    },
    {
      locator: `${REPO}#21`,
      key: `${REPO}#21`,
      title: 'Mobile arc: fabric',
      url: `https://github.com/${REPO}/issues/21`,
      closed: false,
      status: 'Backlog',
      parentLocator: `${REPO}#20`,
      subIssues: null,
      pullRequest: null,
      sortOrder: 21
    }
  ]);
  const parent = index.get(`${REPO}#20`)!;
  assert.equal(parent.totalChildren, 1);
  assert.equal(parent.completedChildren, 0);
});

test('the Kanban card renders header, chips, progress, children and PR', async () => {
  const app = await readFile(new URL('../app.tsx', import.meta.url), 'utf8');
  const card = app.match(/function KanbanCard\(\{[\s\S]*?\nfunction KanbanBoard/u)?.[0];
  assert.ok(card, 'Missing KanbanCard');
  // Short reference inline with the title, full locator kept in the tooltip.
  assert.match(card, /cardReference\(item\.key, singleRepository\)/u);
  assert.match(card, /title=\{item\.key\}/u);
  assert.match(card, /visibleChipLabels\(item\.labels, \{[\s\S]*?hideStatusLabels,/u);
  assert.match(card, /data-chip-tone=\{labelChipTone\(label\)\}/u);
  assert.match(card, /\{chipLabelText\(label\)\}/u);
  assert.match(card, /<EpicSummary item=\{item\} listId=\{listId\}/u);
  // Folded cards drop the updated timestamp the reference board does not show.
  assert.doesNotMatch(card, /formatUpdatedAt/u);

  const summary = app.match(/function EpicSummary\(\{[\s\S]*?\nfunction KanbanCard/u)?.[0];
  assert.ok(summary, 'Missing EpicSummary');
  assert.match(summary, /role="progressbar"/u);
  assert.match(summary, /epicProgressLabel\(epic\)/u);
  assert.match(summary, /pullRequestFooterText\(epic\.pullRequest\)/u);
  assert.match(summary, /aria-expanded=\{expanded\}/u);
  assert.match(summary, /data-child-state=\{child\.closed \? 'closed' : 'open'\}/u);
  // Children link out to their own issue without disturbing the card.
  assert.match(summary, /href=\{child\.url\}/u);
  assert.match(summary, /onClick=\{event => event\.stopPropagation\(\)\}/u);
  assert.match(summary, /onPointerDown=\{event => event\.stopPropagation\(\)\}/u);

  const board = app.match(/function KanbanBoard[\s\S]*?\nfunction TrackerList/u)?.[0];
  assert.ok(board, 'Missing KanbanBoard');
  assert.match(board, /foldedBoardItems\(allItems, foldChildren\)/u);
  assert.match(board, /singleRepositoryBoard\(allItems\)/u);
  // A tracker-owned board supplies the column order and hides status labels.
  assert.match(board, /result\.boardOrdered && result\.options\.length > 0/u);
  assert.match(board, /setBoardOrder\(result\.options\.map\(option => option\.name\)\)/u);
  assert.match(board, /boardOrder && boardOrder\.length > 0 \? boardOrder : statusOrder/u);
  assert.match(board, /hideStatusLabels=\{boardOrder !== null\}/u);
  // Even lane padding on every side, card spacing untouched.
  assert.match(board, /className="tb-kanban-lane min-h-20 flex-1 space-y-1\.5 p-3"/u);
});

test('chips drop their group prefix and hide the status group', () => {
  assert.equal(chipLabelText('type:epic'), 'epic');
  assert.equal(chipLabelText('area:deck'), 'deck');
  assert.equal(chipLabelText('bug'), 'bug');
  assert.deepEqual(
    visibleChipLabels(['type:epic', 'area:deck', 'status:in-progress'], {
      hideStatusLabels: true
    }),
    ['type:epic', 'area:deck']
  );
  assert.deepEqual(
    visibleChipLabels(['type:epic', 'status:ready'], {
      hideStatusLabels: false
    }),
    ['type:epic', 'status:ready']
  );
  assert.deepEqual(
    visibleChipLabels(['type:epic', 'kind:epic', 'area:deck'], {
      hideStatusLabels: true,
      limit: 2
    }),
    ['type:epic', 'area:deck']
  );
  assert.equal(labelChipTone('epic'), 'type');
  assert.equal(labelChipTone('type:epic'), 'type');
  assert.equal(labelChipTone('type:feature'), 'feature');
  assert.equal(labelChipTone('spike'), 'spike');
  assert.equal(labelChipTone('type:polish'), 'polish');
  assert.equal(labelChipTone('type:chore'), 'area');
  assert.equal(labelChipTone('task'), 'area');
});

test('the card reference shortens to #N on a single-repository board', () => {
  assert.equal(cardReference(`${REPO}#9`, true), '#9');
  assert.equal(cardReference(`${REPO}#9`, false), 'mock-highgui-github#9');
  assert.equal(cardReference('TASK-42', true), 'TASK-42');
  assert.equal(
    singleRepositoryBoard([{ project: REPO }, { project: REPO }]),
    true
  );
  assert.equal(
    singleRepositoryBoard([{ project: REPO }, { project: 'a/b' }]),
    false
  );
});

const child = (over: Partial<WorkItemChild> = {}): WorkItemChild => ({
  key: `${REPO}#1`,
  title: 'A child',
  url: '',
  closed: false,
  status: '',
  ...over
});

test('a child row reads from its own status, not just open/closed', () => {
  assert.equal(epicChildTone(child({ status: 'Needs-you' })), 'attention');
  assert.equal(epicChildTone(child({ status: 'ready-for-human' })), 'attention');
  assert.equal(epicChildTone(child({ status: 'Working' })), 'progress');
  assert.equal(epicChildTone(child({ status: 'In progress' })), 'progress');
  assert.equal(epicChildTone(child({ status: 'Backlog' })), 'backlog');
  assert.equal(epicChildTone(child({ status: 'ready-for-agent' })), 'todo');
  assert.equal(epicChildTone(child({ status: 'needs-triage' })), 'triage');
  // Both vocabularies land on the same tone, which is the point of the table.
  assert.equal(
    epicChildTone(child({ status: 'Needs you' })),
    epicChildTone(child({ status: 'ready-for-human' }))
  );
});

test('a closed child reads done however its column is named', () => {
  // A stale column on a closed issue must never make finished work read as open.
  assert.equal(
    epicChildTone(child({ closed: true, status: 'Needs-you' })),
    'done'
  );
  assert.equal(epicChildTone(child({ closed: true, status: '' })), 'done');
});

test('an unknown status falls back rather than picking a colour at random', () => {
  assert.equal(epicChildTone(child({ status: 'Marinating' })), 'todo');
  assert.equal(epicChildTone(child({ status: '' })), 'unset');
  assert.equal(epicChildTone(child({ status: 'No status' })), 'unset');
});

test('each tone draws the right glyph category', () => {
  assert.equal(epicChildCategory('done'), 'done');
  assert.equal(epicChildCategory('progress'), 'in_progress');
  assert.equal(epicChildCategory('backlog'), 'backlog');
  assert.equal(epicChildCategory('triage'), 'backlog');
  assert.equal(epicChildCategory('attention'), 'todo');
  assert.equal(epicChildCategory('unset'), 'todo');
});

test('the epic counts the children waiting on a human', () => {
  const epic = {
    parentKey: null,
    children: [
      child({ key: `${REPO}#1`, status: 'Needs-you' }),
      child({ key: `${REPO}#2`, status: 'Working' }),
      child({ key: `${REPO}#3`, status: 'ready-for-human' }),
      // Closed wins, so this one does not count despite saying needs-you.
      child({ key: `${REPO}#4`, status: 'Needs-you', closed: true })
    ],
    completedChildren: 1,
    totalChildren: 4,
    pullRequest: null
  };
  assert.deepEqual(
    epicChildrenNeedingYou(epic).map(entry => entry.key),
    [`${REPO}#1`, `${REPO}#3`]
  );
});

const card = (over: Record<string, unknown> = {}) =>
  ({
    bbProjectId: 'proj_1',
    source: 'github',
    locator: `${REPO}#19`,
    key: `${REPO}#19`,
    title: 'Mobile tap latency',
    description: '',
    url: '',
    status: 'Needs-you',
    stateCategory: 'in_progress',
    priority: null,
    assignee: null,
    project: null,
    labels: [],
    updatedAt: '',
    epic: null,
    ...over
  }) as never;

test('a card waiting on a human wears the rail, by its own status', () => {
  assert.equal(workItemNeedsYou(card()), true);
  assert.equal(workItemNeedsYou(card({ status: 'Working' })), false);
});

test('an epic wears the rail when a child needs you, folded or not', () => {
  const epic = {
    parentKey: null,
    children: [child({ status: 'Working' }), child({ status: 'Needs-you' })],
    completedChildren: 0,
    totalChildren: 2,
    pullRequest: null
  };
  assert.equal(workItemNeedsYou(card({ status: 'Working', epic })), true);
  assert.equal(
    workItemNeedsYou(card({ status: 'Working', epic: { ...epic, children: [] } })),
    false
  );
});

test('finished work never wears the rail, whatever its column says', () => {
  // A closed issue left sitting in Needs-you is not asking for anything.
  assert.equal(
    workItemNeedsYou(card({ status: 'Needs-you', stateCategory: 'done' })),
    false
  );
});

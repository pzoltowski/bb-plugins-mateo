import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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

const [{ createGithubAdapter }, projects] = await Promise.all([
  import('../sources/github.ts'),
  import('../sources/github-projects.ts')
]);
const {
  categorizeStatusOption,
  clearGithubProjectCache,
  isMissingProjectScopeError,
  MISSING_PROJECT_SCOPE_MESSAGE,
  NO_STATUS_ID
} = projects;

const PROJECT = { owner: 'pzoltowski', number: 1 } as const;
const REPO = 'pzoltowski/mock-highgui-github';

const STATUS_OPTIONS = [
  { id: 'opt-backlog', name: 'Backlog' },
  { id: 'opt-ready', name: 'Ready' },
  { id: 'opt-progress', name: 'In progress' },
  { id: 'opt-needs-you', name: 'Needs-you' },
  { id: 'opt-done', name: 'Done' }
];

function content(
  number: number,
  title: string,
  hierarchy: {
    parent?: number;
    subIssues?: { total: number; completed: number };
    prs?: {
      number: number;
      isDraft: boolean;
      state: string;
      headRefName: string;
    }[];
  } = {}
) {
  return {
    parent: hierarchy.parent
      ? {
          number: hierarchy.parent,
          repository: { nameWithOwner: REPO }
        }
      : null,
    subIssuesSummary: hierarchy.subIssues ?? null,
    closedByPullRequestsReferences: hierarchy.prs
      ? { nodes: hierarchy.prs }
      : null,
    __typename: 'Issue',
    number,
    title,
    state: 'OPEN',
    url: `https://github.com/${REPO}/issues/${number}`,
    updatedAt: '2026-09-08T10:00:00Z',
    body: 'body',
    repository: { nameWithOwner: REPO },
    labels: { nodes: [{ name: 'type:feature' }] },
    assignees: { nodes: [{ login: 'pzoltowski' }] }
  };
}

interface CliCall {
  args: string[];
}

/** Minimal `gh` stub: routes GraphQL documents by the operation they contain. */
function makeCli(
  overrides: {
    items?: unknown[];
    onMutation?: (args: string[]) => string;
    failWith?: Error;
  } = {}
) {
  const calls: CliCall[] = [];
  const items = overrides.items ?? [
    {
      id: 'PVTI_one',
      fieldValueByName: { optionId: 'opt-backlog', name: 'Backlog' },
      content: content(25, 'Spike')
    }
  ];
  const run = async (args: string[]): Promise<string> => {
    calls.push({ args });
    if (overrides.failWith) throw overrides.failWith;
    const query = args.find(arg => arg.startsWith('query='))!.slice('query='.length);
    const root = query.includes('organization(login') ? 'organization' : 'user';
    if (query.startsWith('mutation')) {
      return overrides.onMutation?.(args) ?? JSON.stringify({ data: {} });
    }
    if (query.includes('issueOrPullRequest')) {
      return JSON.stringify({
        data: { repository: { issueOrPullRequest: { id: 'I_node' } } }
      });
    }
    if (query.includes('field(name:"Status")')) {
      return JSON.stringify({
        data: {
          [root]: {
            projectV2: {
              id: 'PVT_1',
              title: 'Agent Workflow (Mocks)',
              field: {
                id: 'PVTSSF_status',
                name: 'Status',
                options: STATUS_OPTIONS
              }
            }
          }
        }
      });
    }
    return JSON.stringify({
      data: {
        [root]: {
          projectV2: {
            id: 'PVT_1',
            items: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: items
            }
          }
        }
      }
    });
  };
  return { run, calls };
}

/** BB plugin API stub covering only the RPCs the GitHub adapter calls. */
function makeBb(issues: unknown[]) {
  return {
    sdk: {
      plugins: {
        callRpc: async ({
          method,
          input,
          outputSchema
        }: {
          method: string;
          input: unknown;
          outputSchema: { parse: (value: unknown) => unknown };
        }) => {
          if (method === 'status') {
            return outputSchema.parse({
              ghOk: true,
              ghError: null,
              repos: [{ repo: REPO, projectId: 'proj_test' }],
              lastSyncedAt: null
            });
          }
          if (method === 'listItems') {
            return outputSchema.parse({ items: issues });
          }
          if (method === 'getIssue') {
            const number = (input as { number: number }).number;
            const issue = (issues as Array<{ number: number }>).find(
              candidate => candidate.number === number
            );
            if (!issue) throw new Error('not found');
            const { kind: _kind, ...rest } = issue as Record<string, unknown>;
            return outputSchema.parse({ issue: { ...rest, comments: [] } });
          }
          throw new Error(`unexpected rpc ${method}`);
        }
      }
    },
    log: { warn() {}, info() {}, error() {} }
  } as never;
}

function ghIssue(number: number, title: string) {
  return {
    repo: REPO,
    number,
    kind: 'issue' as const,
    title,
    state: 'open',
    author: 'pzoltowski',
    labels: ['type:feature'],
    assignees: ['pzoltowski'],
    url: `https://github.com/${REPO}/issues/${number}`,
    body: 'body',
    updatedAt: '2026-09-08T10:00:00Z'
  };
}

test('project columns map onto BB state categories', () => {
  assert.equal(categorizeStatusOption('Backlog', 0, 5), 'backlog');
  assert.equal(categorizeStatusOption('Ready', 1, 5), 'todo');
  assert.equal(categorizeStatusOption('Needs-you', 3, 5), 'in_progress');
  assert.equal(categorizeStatusOption('Done', 4, 5), 'done');
  // Position decides for names the plugin does not recognise.
  assert.equal(categorizeStatusOption('Marinating', 2, 5), 'in_progress');
  assert.equal(categorizeStatusOption('Marinating', 0, 3), 'backlog');
  assert.equal(categorizeStatusOption('Marinating', 2, 3), 'done');
  // Explicit names win over position.
  assert.equal(categorizeStatusOption('Completed', 0, 4), 'done');
});

test('statusOptions returns the board columns in project order', async () => {
  clearGithubProjectCache();
  const cli = makeCli();
  const adapter = createGithubAdapter(
    makeBb([ghIssue(25, 'Spike')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  const options = await adapter.statusOptions(`${REPO}#25`);
  assert.deepEqual(
    options.map(option => [option.id, option.name, option.stateCategory]),
    [
      ['opt-backlog', 'Backlog', 'backlog'],
      ['opt-ready', 'Ready', 'todo'],
      ['opt-progress', 'In progress', 'in_progress'],
      ['opt-needs-you', 'Needs-you', 'in_progress'],
      ['opt-done', 'Done', 'done']
    ]
  );
  assert.deepEqual(
    options.filter(option => option.current).map(option => option.id),
    ['opt-backlog']
  );
});

test('an issue that is not on the board offers a current "No status"', async () => {
  clearGithubProjectCache();
  const cli = makeCli();
  const adapter = createGithubAdapter(
    makeBb([ghIssue(8, 'Off board')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  const options = await adapter.statusOptions(`${REPO}#8`);
  assert.equal(options[0]!.id, NO_STATUS_ID);
  assert.equal(options[0]!.current, true);
  assert.equal(options.length, STATUS_OPTIONS.length + 1);
});

test('list joins repository issues with the board and keeps board-only cards', async () => {
  clearGithubProjectCache();
  const cli = makeCli({
    items: [
      {
        id: 'PVTI_one',
        fieldValueByName: { optionId: 'opt-ready', name: 'Ready' },
        content: content(25, 'Spike')
      },
      {
        id: 'PVTI_two',
        fieldValueByName: { optionId: 'opt-done', name: 'Done' },
        content: {
          ...content(3, 'Card from an unmapped repository'),
          repository: { nameWithOwner: 'pzoltowski/other-repo' },
          url: 'https://github.com/pzoltowski/other-repo/issues/3'
        }
      }
    ]
  });
  const adapter = createGithubAdapter(
    makeBb([ghIssue(25, 'Spike'), ghIssue(8, 'Off board')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  const items = await adapter.list();
  assert.deepEqual(
    items.map(item => [item.locator, item.status, item.stateCategory]),
    [
      [`${REPO}#25`, 'Ready', 'todo'],
      [`${REPO}#8`, 'No status', 'backlog'],
      ['pzoltowski/other-repo#3', 'Done', 'done']
    ]
  );
});

test('moving a card issues the single-select field mutation', async () => {
  clearGithubProjectCache();
  const mutations: string[][] = [];
  const cli = makeCli({
    onMutation: args => {
      mutations.push(args);
      return JSON.stringify({
        data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_one' } } }
      });
    }
  });
  const adapter = createGithubAdapter(
    makeBb([ghIssue(25, 'Spike')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  const moved = await adapter.updateStatus(`${REPO}#25`, 'opt-ready');
  assert.equal(mutations.length, 1);
  const args = mutations[0]!;
  assert.ok(
    args.some(arg => arg.startsWith('query=mutation') && arg.includes('updateProjectV2ItemFieldValue'))
  );
  assert.ok(args.includes('projectId=PVT_1'));
  assert.ok(args.includes('itemId=PVTI_one'));
  assert.ok(args.includes('fieldId=PVTSSF_status'));
  assert.ok(args.includes('optionId=opt-ready'));
  assert.equal(moved.locator, `${REPO}#25`);
});

test('a card missing from the board is added before it is moved', async () => {
  clearGithubProjectCache();
  const mutations: string[][] = [];
  const cli = makeCli({
    items: [],
    onMutation: args => {
      mutations.push(args);
      return args.some(arg => arg.includes('addProjectV2ItemById'))
        ? JSON.stringify({
            data: { addProjectV2ItemById: { item: { id: 'PVTI_new' } } }
          })
        : JSON.stringify({
            data: {
              updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_new' } }
            }
          });
    }
  });
  const adapter = createGithubAdapter(
    makeBb([ghIssue(8, 'Off board')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  await adapter.updateStatus(`${REPO}#8`, 'opt-ready');
  assert.equal(mutations.length, 2);
  assert.ok(mutations[0]!.some(arg => arg.includes('addProjectV2ItemById')));
  assert.ok(mutations[0]!.includes('contentId=I_node'));
  assert.ok(mutations[1]!.includes('itemId=PVTI_new'));
});

test('an unknown status id is rejected before any mutation runs', async () => {
  clearGithubProjectCache();
  const cli = makeCli();
  const adapter = createGithubAdapter(
    makeBb([ghIssue(25, 'Spike')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  await assert.rejects(
    adapter.updateStatus(`${REPO}#25`, 'opt-nope'),
    /status is not available/u
  );
});

test('a missing Projects scope is reported with the refresh command', async () => {
  clearGithubProjectCache();
  assert.equal(
    isMissingProjectScopeError(
      new Error(
        "Your token has not been granted the required scopes to execute this query. The 'id' field requires one of the following scopes: ['read:project']"
      )
    ),
    true
  );
  const cli = makeCli({
    failWith: new Error(
      "Your token has not been granted the required scopes to execute this query. The 'id' field requires one of the following scopes: ['read:project']"
    )
  });
  const adapter = createGithubAdapter(
    makeBb([ghIssue(25, 'Spike')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  await assert.rejects(adapter.statusOptions(`${REPO}#25`), (error: Error) => {
    assert.equal(error.message, MISSING_PROJECT_SCOPE_MESSAGE);
    return true;
  });
});

test('without a configured project the adapter still reports Open and Closed', async () => {
  clearGithubProjectCache();
  const cli = makeCli();
  const adapter = createGithubAdapter(
    makeBb([ghIssue(25, 'Spike')]),
    true,
    'proj_test',
    cli.run
  );
  const options = await adapter.statusOptions(`${REPO}#25`);
  assert.deepEqual(
    options.map(option => option.id),
    ['open', 'closed']
  );
  assert.equal(cli.calls.length, 0);
});

test('board items carry parent, progress and pull request facts', async () => {
  clearGithubProjectCache();
  const cli = makeCli({
    items: [
      {
        id: 'PVTI_epic',
        fieldValueByName: { optionId: 'opt-progress', name: 'In progress' },
        content: content(10, 'Timeline', {
          subIssues: { total: 6, completed: 2 },
          prs: [
            {
              number: 17,
              isDraft: true,
              state: 'OPEN',
              headRefName: 'feat/timeline'
            }
          ]
        })
      },
      {
        id: 'PVTI_child',
        fieldValueByName: null,
        content: content(11, 'Timeline: pure C seams', { parent: 10 })
      }
    ]
  });
  const adapter = createGithubAdapter(
    makeBb([ghIssue(10, 'Timeline'), ghIssue(11, 'Timeline: pure C seams')]),
    true,
    'proj_test',
    cli.run,
    PROJECT
  );
  const items = await adapter.list();
  const parent = items.find(item => item.locator === `${REPO}#10`)!;
  const child = items.find(item => item.locator === `${REPO}#11`)!;
  assert.equal(parent.epic?.parentKey, null);
  assert.equal(parent.epic?.totalChildren, 6);
  assert.equal(parent.epic?.completedChildren, 2);
  assert.deepEqual(parent.epic?.children.map(entry => entry.key), [
    `${REPO}#11`
  ]);
  assert.deepEqual(parent.epic?.pullRequest, {
    number: 17,
    state: 'draft',
    branch: 'feat/timeline'
  });
  assert.equal(child.epic?.parentKey, `${REPO}#10`);
});

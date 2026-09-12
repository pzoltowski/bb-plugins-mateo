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

const { createLinearAdapter } = await import('../sources/linear.ts');

const TEAM_KEY = 'MOV';
const TEAM = { key: TEAM_KEY, name: 'Mock HighGUI' };

interface StateSpec {
  name: string;
  type: string;
}

function state(spec: StateSpec) {
  return { id: `st-${spec.name.toLowerCase()}`, ...spec };
}

function issue(
  id: string,
  identifier: string,
  title: string,
  spec: StateSpec,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    identifier,
    title,
    description: 'body',
    url: `https://linear.app/mock/issue/${identifier}`,
    priorityLabel: 'Medium',
    updatedAt: '2026-09-12T10:00:00Z',
    state: state(spec),
    assignee: null,
    team: TEAM,
    project: null,
    parent: null,
    labels: { nodes: [] },
    ...extra
  };
}

const EPIC = issue('id-1', 'MOV-1', 'Timeline', { name: 'In Progress', type: 'started' });
const CHILD_OPEN = issue('id-2', 'MOV-2', 'Timeline: seams', { name: 'Ready', type: 'unstarted' }, { parent: { id: 'id-1' } });
const CHILD_DONE = issue('id-3', 'MOV-3', 'Timeline: ruler', { name: 'Done', type: 'completed' }, { parent: { id: 'id-1' } });
const CHILD_CANCELED = issue('id-4', 'MOV-4', 'Timeline: dropped slice', { name: 'Canceled', type: 'canceled' }, { parent: { id: 'id-1' } });

function withFetch(
  respond: (body: { query: string; variables: Record<string, unknown> }) => unknown,
  run: () => Promise<void>
) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      query: string;
      variables: Record<string, unknown>;
    };
    return new Response(JSON.stringify({ data: respond(body) }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function adapter() {
  return createLinearAdapter({
    enabled: true,
    apiKey: 'lin_api_test',
    teamKey: TEAM_KEY
  });
}

test('list syncs completed and canceled issues and folds children', async () => {
  await withFetch(
    body => {
      if (body.query.includes('TeamIssues')) {
        return {
          issues: {
            nodes: [EPIC, CHILD_OPEN, CHILD_DONE, CHILD_CANCELED],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        };
      }
      throw new Error(`unexpected query: ${body.query}`);
    },
    async () => {
      const items = await adapter().list();
      assert.deepEqual(
        items.map(item => [item.key, item.stateCategory]),
        [
          ['MOV-1', 'in_progress'],
          ['MOV-2', 'todo'],
          ['MOV-3', 'done'],
          ['MOV-4', 'canceled']
        ]
      );
      const epic = items.find(item => item.locator === 'id-1')!;
      assert.equal(epic.epic?.parentKey, null);
      assert.equal(epic.epic?.totalChildren, 3);
      // Closed counts completed and canceled alike, matching GitHub.
      assert.equal(epic.epic?.completedChildren, 2);
      assert.deepEqual(
        epic.epic?.children.map(child => [child.key, child.closed, child.status]),
        [
          ['id-2', false, 'Ready'],
          ['id-3', true, 'Done'],
          ['id-4', true, 'Canceled']
        ]
      );
      const child = items.find(item => item.locator === 'id-2')!;
      assert.equal(child.epic?.parentKey, 'id-1');
    }
  );
});

test('get carries the epic record built from parent and children', async () => {
  await withFetch(
    body => {
      if (body.query.includes('TaskboardLinearIssue')) {
        return {
          issue: {
            ...EPIC,
            children: {
              nodes: [
                { id: 'id-2', identifier: 'MOV-2', title: 'Timeline: seams', url: 'https://linear.app/mock/issue/MOV-2', state: state({ name: 'Ready', type: 'unstarted' }) },
                { id: 'id-3', identifier: 'MOV-3', title: 'Timeline: ruler', url: 'https://linear.app/mock/issue/MOV-3', state: state({ name: 'Done', type: 'completed' }) }
              ]
            },
            comments: { nodes: [] }
          }
        };
      }
      throw new Error(`unexpected query: ${body.query}`);
    },
    async () => {
      const item = await adapter().get('id-1');
      assert.equal(item.epic?.totalChildren, 2);
      assert.equal(item.epic?.completedChildren, 1);
      assert.deepEqual(
        item.epic?.children.map(child => child.status),
        ['Ready', 'Done']
      );
    }
  );
});

test('statusOptions exposes every workflow state as a column', async () => {
  await withFetch(
    body => {
      if (body.query.includes('TaskboardLinearStatusOptions')) {
        return {
          issue: {
            id: 'id-1',
            state: state({ name: 'In Progress', type: 'started' }),
            team: {
              key: TEAM_KEY,
              states: {
                nodes: [
                  state({ name: 'Backlog', type: 'backlog' }),
                  state({ name: 'Ready', type: 'unstarted' }),
                  state({ name: 'In Progress', type: 'started' }),
                  state({ name: 'Needs-you', type: 'started' }),
                  state({ name: 'Done', type: 'completed' }),
                  state({ name: 'Canceled', type: 'canceled' })
                ]
              }
            }
          }
        };
      }
      throw new Error(`unexpected query: ${body.query}`);
    },
    async () => {
      const options = await adapter().statusOptions('id-1');
      assert.deepEqual(
        options.map(option => [option.name, option.stateCategory]),
        [
          ['Backlog', 'backlog'],
          ['Ready', 'todo'],
          ['In Progress', 'in_progress'],
          ['Needs-you', 'in_progress'],
          ['Done', 'done'],
          ['Canceled', 'canceled']
        ]
      );
    }
  );
});

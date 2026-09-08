import { z } from 'zod';
import type {
  WorkItemEpic,
  WorkItemPullRequest,
  WorkStateCategory
} from '../contract.js';
import type {
  ExternalWorkItem,
  ExternalWorkItemDetail,
  ExternalWorkStatusOption
} from './types.js';

/**
 * GitHub Projects (v2) support for the GitHub work source.
 *
 * The plugin's GitHub adapter reads issues through BB's official GitHub
 * plugin (REST), which only knows Open and Closed. A GitHub Project board
 * carries the real workflow status in a single-select `Status` field, so when
 * a BB project binds an owner + project number the adapter reads columns and
 * moves cards through the GraphQL API instead.
 */

export interface GithubProjectRef {
  readonly owner: string;
  readonly number: number;
}

export type RunGithubCli = (
  args: string[],
  timeoutMs?: number
) => Promise<string>;

/** Synthetic status for issues in mapped repositories that are not on the board. */
export const NO_STATUS_ID = '__none';
export const NO_STATUS_NAME = 'No status';

export const MISSING_PROJECT_SCOPE_MESSAGE =
  'GitHub CLI is missing the Projects scope. Run: gh auth refresh -h github.com -s project,read:project';

const statusFieldSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    options: z.array(
      z.object({ id: z.string().min(1), name: z.string() }).strict()
    )
  })
  .strict();

const projectFieldsSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    field: statusFieldSchema.nullable()
  })
  .strict();

const contentSchema = z
  .object({
    __typename: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    url: z.string(),
    updatedAt: z.string(),
    body: z.string().nullable().default(''),
    repository: z.object({ nameWithOwner: z.string().min(1) }).strict(),
    labels: z
      .object({ nodes: z.array(z.object({ name: z.string() }).strict()) })
      .strict()
      .nullable(),
    assignees: z
      .object({ nodes: z.array(z.object({ login: z.string() }).strict()) })
      .strict()
      .nullable(),
    // Sub-issue hierarchy, only present on Issue content.
    parent: z
      .object({
        number: z.number().int().positive(),
        repository: z.object({ nameWithOwner: z.string().min(1) }).strict()
      })
      .strict()
      .nullable()
      .default(null),
    subIssuesSummary: z
      .object({
        total: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative()
      })
      .strict()
      .nullable()
      .default(null),
    closedByPullRequestsReferences: z
      .object({
        nodes: z.array(
          z
            .object({
              number: z.number().int().positive(),
              isDraft: z.boolean(),
              state: z.string(),
              headRefName: z.string()
            })
            .strict()
        )
      })
      .strict()
      .nullable()
      .default(null)
  })
  .strict();

const itemNodeSchema = z
  .object({
    id: z.string().min(1),
    fieldValueByName: z
      .object({
        optionId: z.string().nullable().default(null),
        name: z.string().nullable().default(null)
      })
      .strict()
      .nullable(),
    content: contentSchema.nullable()
  })
  .strict();

const itemsPageSchema = z
  .object({
    id: z.string().min(1),
    items: z
      .object({
        pageInfo: z
          .object({
            hasNextPage: z.boolean(),
            endCursor: z.string().nullable()
          })
          .strict(),
        nodes: z.array(itemNodeSchema)
      })
      .strict()
  })
  .strict();

const FIELDS_QUERY = `query($owner:String!,$number:Int!){
  OWNER_ROOT(login:$owner){
    projectV2(number:$number){
      id
      title
      field(name:"Status"){
        ... on ProjectV2SingleSelectField { id name options { id name } }
      }
    }
  }
}`;

const ITEMS_QUERY = `query($owner:String!,$number:Int!,$after:String){
  OWNER_ROOT(login:$owner){
    projectV2(number:$number){
      id
      items(first:100, after:$after){
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          fieldValueByName(name:"Status"){
            ... on ProjectV2ItemFieldSingleSelectValue { optionId name }
          }
          content {
            __typename
            ... on Issue {
              number title state url updatedAt body
              repository { nameWithOwner }
              labels(first:20){ nodes { name } }
              assignees(first:10){ nodes { login } }
              parent { number repository { nameWithOwner } }
              subIssuesSummary { total completed }
              closedByPullRequestsReferences(first:5, includeClosedPrs:true){
                nodes { number isDraft state headRefName }
              }
            }
            ... on PullRequest {
              number title state url updatedAt body
              repository { nameWithOwner }
              labels(first:20){ nodes { name } }
              assignees(first:10){ nodes { login } }
            }
          }
        }
      }
    }
  }
}`;

const ISSUE_NODE_QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issueOrPullRequest(number:$number){
      ... on Issue { id }
      ... on PullRequest { id }
    }
  }
}`;

export interface GithubProjectStatusOption {
  readonly id: string;
  readonly name: string;
  readonly stateCategory: WorkStateCategory;
}

export interface GithubProjectItem {
  readonly itemId: string;
  readonly locator: string;
  readonly statusOptionId: string | null;
  readonly statusName: string | null;
  readonly content: z.infer<typeof contentSchema> | null;
}

/** The hierarchy facts one issue contributes, independent of where they came from. */
export interface EpicSourceItem {
  readonly locator: string;
  readonly title: string;
  readonly url: string;
  readonly closed: boolean;
  readonly parentLocator: string | null;
  readonly subIssues: { total: number; completed: number } | null;
  readonly pullRequest: WorkItemPullRequest | null;
}

export interface GithubProjectSnapshot {
  readonly projectId: string;
  readonly title: string;
  readonly statusFieldId: string;
  readonly options: readonly GithubProjectStatusOption[];
  readonly items: readonly GithubProjectItem[];
  readonly itemsByLocator: ReadonlyMap<string, GithubProjectItem>;
  readonly epicsByLocator: ReadonlyMap<string, WorkItemEpic>;
  readonly fetchedAt: number;
}

export function epicSourceItems(
  items: readonly GithubProjectItem[]
): EpicSourceItem[] {
  return items.flatMap(item => {
    const content = item.content;
    if (!content) return [];
    return [
      {
        locator: item.locator,
        title: content.title,
        url: content.url,
        closed: content.state.toUpperCase() !== 'OPEN',
        parentLocator: content.parent
          ? `${content.parent.repository.nameWithOwner}#${content.parent.number}`
          : null,
        subIssues:
          content.subIssuesSummary && content.subIssuesSummary.total > 0
            ? {
                total: content.subIssuesSummary.total,
                completed: content.subIssuesSummary.completed
              }
            : null,
        pullRequest: pickPullRequest(
          content.closedByPullRequestsReferences?.nodes ?? []
        )
      }
    ];
  });
}

function issueNumber(locator: string): number {
  const raw = Number(locator.slice(locator.indexOf('#') + 1));
  return Number.isSafeInteger(raw) ? raw : 0;
}

/**
 * Choose the pull request a card should show. An open or draft PR is the one
 * the reader acts on; a merged one is the record of a finished epic.
 */
export function pickPullRequest(
  nodes: readonly {
    number: number;
    isDraft: boolean;
    state: string;
    headRefName: string;
  }[]
): WorkItemPullRequest | null {
  const ranked = [...nodes].sort((left, right) => {
    const rank = (node: (typeof nodes)[number]) =>
      node.state.toUpperCase() === 'OPEN'
        ? 0
        : node.state.toUpperCase() === 'MERGED'
          ? 1
          : 2;
    return rank(left) - rank(right) || right.number - left.number;
  });
  const chosen = ranked[0];
  if (!chosen) return null;
  const state = chosen.state.toUpperCase();
  return {
    number: chosen.number,
    state: chosen.isDraft
      ? 'draft'
      : state === 'MERGED'
        ? 'merged'
        : state === 'CLOSED'
          ? 'closed'
          : 'open',
    branch: chosen.headRefName
  };
}

/**
 * Build one epic record per item: its parent, the children the board knows
 * about, and the completed/total counts. GitHub's own sub-issue summary wins
 * over the visible children, because children can live off the board.
 */
export function buildEpicIndex(
  items: readonly EpicSourceItem[]
): Map<string, WorkItemEpic> {
  const known = new Set(items.map(item => item.locator));
  const childrenByParent = new Map<string, EpicSourceItem[]>();
  for (const item of items) {
    if (!item.parentLocator || !known.has(item.parentLocator)) continue;
    const siblings = childrenByParent.get(item.parentLocator) ?? [];
    siblings.push(item);
    childrenByParent.set(item.parentLocator, siblings);
  }
  const index = new Map<string, WorkItemEpic>();
  for (const item of items) {
    const children = (childrenByParent.get(item.locator) ?? [])
      .slice()
      .sort((left, right) => issueNumber(left.locator) - issueNumber(right.locator))
      .slice(0, 100);
    const visibleCompleted = children.filter(child => child.closed).length;
    index.set(item.locator, {
      // A parent the board cannot see is dropped, so the child stays a card
      // instead of disappearing under a parent that is not rendered.
      parentKey:
        item.parentLocator && known.has(item.parentLocator)
          ? item.parentLocator
          : null,
      children: children.map(child => ({
        key: child.locator,
        title: child.title.slice(0, 300),
        url: child.url,
        closed: child.closed
      })),
      completedChildren: item.subIssues
        ? item.subIssues.completed
        : visibleCompleted,
      totalChildren: item.subIssues ? item.subIssues.total : children.length,
      pullRequest: item.pullRequest
    });
  }
  return index;
}

const DONE_NAMES = new Set([
  'done',
  'closed',
  'complete',
  'completed',
  'shipped',
  'released',
  'merged'
]);
const CANCELED_NAMES = new Set([
  'canceled',
  'cancelled',
  'wont do',
  "won't do",
  'duplicate',
  'abandoned'
]);
const TODO_NAMES = new Set(['todo', 'to do', 'ready', 'next', 'up next']);
const BACKLOG_NAMES = new Set(['backlog', 'icebox', 'triage', 'new']);

/**
 * Map a project column onto the plugin's state categories. Explicit names win
 * so a board that starts with "Done" is not mistaken for a backlog; position
 * is the fallback (first column backlog, last column done, rest in progress).
 */
export function categorizeStatusOption(
  name: string,
  index: number,
  total: number
): WorkStateCategory {
  const normalized = name.trim().toLowerCase();
  if (DONE_NAMES.has(normalized)) return 'done';
  if (CANCELED_NAMES.has(normalized)) return 'canceled';
  if (BACKLOG_NAMES.has(normalized)) return 'backlog';
  if (TODO_NAMES.has(normalized)) return 'todo';
  if (total <= 1) return 'todo';
  if (index === 0) return 'backlog';
  if (index === total - 1) return 'done';
  return 'in_progress';
}

export function isMissingProjectScopeError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  return (
    /INSUFFICIENT_SCOPES/i.test(message) ||
    (/scope/i.test(message) && /read:project|\bproject\b/i.test(message))
  );
}

function rethrowGraphqlError(error: unknown): never {
  if (isMissingProjectScopeError(error)) {
    throw new Error(MISSING_PROJECT_SCOPE_MESSAGE);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

function isUnknownOwnerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Could not resolve to a (User|Organization)/i.test(message);
}

async function graphql<T>(
  runGithubCli: RunGithubCli,
  query: string,
  variables: Record<string, string | number>,
  pick: (data: Record<string, unknown>, root: string) => unknown,
  parse: (value: unknown) => T
): Promise<T> {
  const roots = ['user', 'organization'] as const;
  let lastError: unknown;
  for (const root of roots) {
    const args = ['api', 'graphql', '-f', `query=${query.replace('OWNER_ROOT', root)}`];
    for (const [key, value] of Object.entries(variables)) {
      args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
    }
    try {
      const payload = JSON.parse(await runGithubCli(args, 30_000)) as {
        data?: Record<string, unknown>;
      };
      const picked = pick(payload.data ?? {}, root);
      if (picked === null || picked === undefined) {
        lastError = new Error(
          `GitHub project ${variables.number} was not found for ${variables.owner}`
        );
        continue;
      }
      return parse(picked);
    } catch (error) {
      if (isUnknownOwnerError(error)) {
        lastError = error;
        continue;
      }
      rethrowGraphqlError(error);
    }
  }
  rethrowGraphqlError(lastError);
}

function locatorFor(content: z.infer<typeof contentSchema>): string {
  return `${content.repository.nameWithOwner}#${content.number}`;
}

const snapshotCache = new Map<string, GithubProjectSnapshot>();
const SNAPSHOT_TTL_MS = 30_000;

function cacheKey(project: GithubProjectRef): string {
  return `${project.owner.toLowerCase()}#${project.number}`;
}

export function clearGithubProjectCache(): void {
  snapshotCache.clear();
}

export async function loadGithubProjectSnapshot(
  runGithubCli: RunGithubCli,
  project: GithubProjectRef,
  options: { refresh?: boolean; now?: number } = {}
): Promise<GithubProjectSnapshot> {
  const now = options.now ?? Date.now();
  const key = cacheKey(project);
  const cached = snapshotCache.get(key);
  if (!options.refresh && cached && now - cached.fetchedAt < SNAPSHOT_TTL_MS) {
    return cached;
  }

  const fields = await graphql(
    runGithubCli,
    FIELDS_QUERY,
    { owner: project.owner, number: project.number },
    (data, root) =>
      (data[root] as { projectV2?: unknown } | null)?.projectV2 ?? null,
    value => projectFieldsSchema.parse(value)
  );
  if (!fields.field) {
    throw new Error(
      `GitHub project ${project.owner}/${project.number} has no single-select Status field`
    );
  }

  const items: GithubProjectItem[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const variables: Record<string, string | number> = {
      owner: project.owner,
      number: project.number
    };
    if (after !== null) variables.after = after;
    const result: z.infer<typeof itemsPageSchema> = await graphql(
      runGithubCli,
      ITEMS_QUERY,
      variables,
      (data, root) =>
        (data[root] as { projectV2?: unknown } | null)?.projectV2 ?? null,
      value => itemsPageSchema.parse(value)
    );
    for (const node of result.items.nodes) {
      if (!node.content) continue;
      items.push({
        itemId: node.id,
        locator: locatorFor(node.content),
        statusOptionId: node.fieldValueByName?.optionId ?? null,
        statusName: node.fieldValueByName?.name ?? null,
        content: node.content
      });
    }
    if (!result.items.pageInfo.hasNextPage) break;
    after = result.items.pageInfo.endCursor;
    if (after === null) break;
  }

  const statusField = fields.field;
  const snapshot: GithubProjectSnapshot = {
    projectId: fields.id,
    title: fields.title,
    statusFieldId: statusField.id,
    options: statusField.options.map((option, index) => ({
      id: option.id,
      name: option.name,
      stateCategory: categorizeStatusOption(
        option.name,
        index,
        statusField.options.length
      )
    })),
    items,
    itemsByLocator: new Map(items.map(item => [item.locator, item])),
    epicsByLocator: buildEpicIndex(epicSourceItems(items)),
    fetchedAt: now
  };
  snapshotCache.set(key, snapshot);
  return snapshot;
}

export function projectStatusOptions(
  snapshot: GithubProjectSnapshot,
  currentStatusId: string | null
): ExternalWorkStatusOption[] {
  const options: ExternalWorkStatusOption[] = snapshot.options.map(option => ({
    id: option.id,
    name: option.name,
    stateCategory: option.stateCategory,
    current: option.id === currentStatusId
  }));
  if (currentStatusId === NO_STATUS_ID) {
    options.unshift({
      id: NO_STATUS_ID,
      name: NO_STATUS_NAME,
      stateCategory: 'backlog',
      current: true
    });
  }
  return options;
}

export function statusForOption(
  snapshot: GithubProjectSnapshot,
  optionId: string | null
): { id: string; name: string; stateCategory: WorkStateCategory } {
  const option = optionId
    ? snapshot.options.find(candidate => candidate.id === optionId)
    : undefined;
  return option
    ? { id: option.id, name: option.name, stateCategory: option.stateCategory }
    : { id: NO_STATUS_ID, name: NO_STATUS_NAME, stateCategory: 'backlog' };
}

/** Build a work item for a card whose repository is not mapped to the BB project. */
export function workItemFromProjectItem(
  snapshot: GithubProjectSnapshot,
  item: GithubProjectItem
): ExternalWorkItemDetail | null {
  const content = item.content;
  if (!content) return null;
  const status = statusForOption(snapshot, item.statusOptionId);
  return {
    source: 'github',
    locator: item.locator,
    key: item.locator,
    title: content.title,
    description: content.body ?? '',
    url: content.url,
    status: status.name,
    stateCategory: status.stateCategory,
    priority: null,
    assignee:
      (content.assignees?.nodes ?? []).map(node => node.login).join(', ') ||
      null,
    project: content.repository.nameWithOwner,
    labels: (content.labels?.nodes ?? []).map(node => node.name),
    updatedAt: content.updatedAt,
    epic: snapshot.epicsByLocator.get(item.locator) ?? null,
    comments: []
  };
}

/** Overlay the board status on an item read through the REST/GitHub-plugin path. */
export function withProjectStatus<T extends ExternalWorkItem>(
  snapshot: GithubProjectSnapshot,
  item: T
): T {
  const projectItem = snapshot.itemsByLocator.get(item.locator);
  const status = statusForOption(snapshot, projectItem?.statusOptionId ?? null);
  return {
    ...item,
    status: status.name,
    stateCategory: status.stateCategory,
    epic: snapshot.epicsByLocator.get(item.locator) ?? null
  };
}

async function resolveContentNodeId(
  runGithubCli: RunGithubCli,
  locator: string
): Promise<string> {
  const [repo, rawNumber] = locator.split('#');
  const [owner, name] = (repo ?? '').split('/');
  const number = Number(rawNumber);
  if (!owner || !name || !Number.isSafeInteger(number) || number < 1) {
    throw new Error(`Invalid GitHub issue locator: ${locator}`);
  }
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${ISSUE_NODE_QUERY}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
    '-F',
    `number=${number}`
  ];
  let payload: unknown;
  try {
    payload = JSON.parse(await runGithubCli(args, 30_000));
  } catch (error) {
    rethrowGraphqlError(error);
  }
  const parsed = z
    .object({
      data: z.object({
        repository: z
          .object({
            issueOrPullRequest: z
              .object({ id: z.string().min(1) })
              .strict()
              .nullable()
          })
          .strict()
          .nullable()
      })
    })
    .parse(payload);
  const id = parsed.data.repository?.issueOrPullRequest?.id;
  if (!id) throw new Error(`GitHub issue ${locator} was not found`);
  return id;
}

/**
 * Move a card to a status option, adding the issue to the board first when it
 * is not on it yet. Moving to a Done column does not close the issue.
 */
export async function setProjectItemStatus(
  runGithubCli: RunGithubCli,
  project: GithubProjectRef,
  locator: string,
  optionId: string
): Promise<void> {
  const snapshot = await loadGithubProjectSnapshot(runGithubCli, project, {
    refresh: true
  });
  if (!snapshot.options.some(option => option.id === optionId)) {
    throw new Error('GitHub project status is not available for this board');
  }
  let itemId = snapshot.itemsByLocator.get(locator)?.itemId;
  if (!itemId) {
    const contentId = await resolveContentNodeId(runGithubCli, locator);
    const addArgs = [
      'api',
      'graphql',
      '-f',
      'query=mutation($projectId:ID!,$contentId:ID!){ addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){ item { id } } }',
      '-f',
      `projectId=${snapshot.projectId}`,
      '-f',
      `contentId=${contentId}`
    ];
    let added: unknown;
    try {
      added = JSON.parse(await runGithubCli(addArgs, 30_000));
    } catch (error) {
      rethrowGraphqlError(error);
    }
    itemId = z
      .object({
        data: z.object({
          addProjectV2ItemById: z
            .object({ item: z.object({ id: z.string().min(1) }).strict() })
            .strict()
        })
      })
      .parse(added).data.addProjectV2ItemById.item.id;
  }
  const updateArgs = [
    'api',
    'graphql',
    '-f',
    'query=mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){ updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){ projectV2Item { id } } }',
    '-f',
    `projectId=${snapshot.projectId}`,
    '-f',
    `itemId=${itemId}`,
    '-f',
    `fieldId=${snapshot.statusFieldId}`,
    '-f',
    `optionId=${optionId}`
  ];
  try {
    await runGithubCli(updateArgs, 30_000);
  } catch (error) {
    rethrowGraphqlError(error);
  }
  snapshotCache.delete(cacheKey(project));
}

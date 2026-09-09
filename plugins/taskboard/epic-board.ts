import type {
  WorkItem,
  WorkItemChild,
  WorkItemEpic,
  WorkItemPullRequest,
  WorkStateCategory
} from './contract.js';

/**
 * Epic folding for the Kanban board.
 *
 * Trackers that report a parent/child hierarchy (today: a bound GitHub
 * Project) let the board show one card per epic with its children folded
 * inside it, instead of a card per issue. Every function here is pure so the
 * rules are testable without rendering.
 */

export type LabelChipTone =
  | 'type'
  | 'feature'
  | 'spike'
  | 'polish'
  | 'area'
  | 'bug'
  | 'decision'
  | 'neutral';

/** The part of a label a chip shows: `type:epic` reads as `epic`. */
export function chipLabelText(label: string): string {
  const trimmed = label.trim();
  const colon = trimmed.indexOf(':');
  const value = colon === -1 ? trimmed : trimmed.slice(colon + 1).trim();
  return value.length > 0 ? value : trimmed;
}

/**
 * Chips a Kanban card shows. `status:*` duplicates the column the card sits
 * in, so it is dropped once a real workflow status is in play.
 */
export function visibleChipLabels(
  labels: readonly string[],
  options: { hideStatusLabels: boolean; limit?: number }
): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    if (
      options.hideStatusLabels &&
      label.toLocaleLowerCase().startsWith('status:')
    ) {
      continue;
    }
    const text = chipLabelText(label);
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(label);
    if (chips.length >= (options.limit ?? 4)) break;
  }
  return chips;
}

/**
 * How a card refers to its issue. One mapped repository needs only `#9`; more
 * than one needs the repository name to stay unambiguous.
 */
export function cardReference(
  locator: string,
  singleRepository: boolean
): string {
  const hash = locator.lastIndexOf('#');
  if (hash === -1) return locator;
  const number = locator.slice(hash);
  if (singleRepository) return number;
  const repo = locator.slice(0, hash);
  const slash = repo.lastIndexOf('/');
  return `${slash === -1 ? repo : repo.slice(slash + 1)}${number}`;
}

/** True when every item comes from the same repository/external project. */
export function singleRepositoryBoard(
  items: readonly { project: string | null }[]
): boolean {
  const repositories = new Set(
    items.map(item => item.project ?? '').filter(Boolean)
  );
  return repositories.size <= 1;
}

/** Colour group for a label chip, mirroring the playbook's board rendering. */
export function labelChipTone(label: string): LabelChipTone {
  const normalized = label.trim().toLocaleLowerCase();
  const value = normalized.includes(':')
    ? normalized.slice(normalized.indexOf(':') + 1).trim()
    : normalized;
  if (value === 'bug' || value === 'defect') return 'bug';
  if (value === 'decision' || value === 'adr') return 'decision';
  if (value === 'feature' || value === 'enhancement') return 'feature';
  if (value === 'spike' || value === 'research') return 'spike';
  if (value === 'polish' || value === 'refactor') return 'polish';
  // Work that is neither an epic nor a shaped type reads as a neutral group.
  if (value === 'chore' || value === 'task') return 'area';
  if (value === 'epic') return 'type';
  if (normalized.startsWith('type:') || normalized.startsWith('kind:')) {
    return 'type';
  }
  if (normalized.startsWith('area:') || normalized.startsWith('scope:')) {
    return 'area';
  }
  return 'neutral';
}

/** True when this item is a child the board should fold into its parent. */
export function isFoldedChild(
  item: WorkItem,
  visibleKeys: ReadonlySet<string>
): boolean {
  const parentKey = item.epic?.parentKey ?? null;
  // An orphan (its parent is not on this board) stays a top-level card so it
  // never disappears.
  return parentKey !== null && visibleKeys.has(parentKey);
}

/** The items the board renders as cards. */
export function foldedBoardItems(
  items: readonly WorkItem[],
  foldChildren: boolean
): readonly WorkItem[] {
  if (!foldChildren) return items;
  const visibleKeys = new Set(items.map(item => item.locator));
  const folded = items.filter(item => !isFoldedChild(item, visibleKeys));
  return folded.length === items.length ? items : folded;
}

/** True when any item carries hierarchy data, i.e. folding can do something. */
export function supportsEpicFolding(items: readonly WorkItem[]): boolean {
  return items.some(item => Boolean(item.epic));
}

/**
 * How a child row reads. The same tone vocabulary the columns already use, so a
 * child and the column it belongs to draw the same shape and colour.
 */
export type EpicChildTone =
  | 'done'
  | 'attention'
  | 'progress'
  | 'backlog'
  | 'triage'
  | 'todo'
  | 'unset';

/**
 * Both vocabularies in one table: the GitHub Project column names and the local
 * `.scratch` frontmatter values, which are not the same words for the same
 * states. Unknown names fall back to `todo` rather than being hashed to a
 * colour — a child row is too small to carry an arbitrary tone.
 */
const CHILD_TONES = new Map<string, EpicChildTone>([
  ['needs you', 'attention'],
  ['needs human', 'attention'],
  ['ready for human', 'attention'],
  ['blocked', 'attention'],
  ['in progress', 'progress'],
  ['working', 'progress'],
  ['started', 'progress'],
  ['doing', 'progress'],
  ['backlog', 'backlog'],
  ['needs info', 'backlog'],
  ['triage', 'triage'],
  ['needs triage', 'triage'],
  ['ready', 'todo'],
  ['ready for agent', 'todo'],
  ['todo', 'todo'],
  ['unstarted', 'todo'],
  ['done', 'done'],
  ['closed', 'done'],
  ['complete', 'done'],
  ['completed', 'done'],
  ['shipped', 'done'],
  ['no status', 'unset'],
  ['none', 'unset']
]);

export function epicChildTone(child: WorkItemChild): EpicChildTone {
  // `closed` is the fact the tracker is certain about; a stale column name on a
  // closed issue must never make it read as open work.
  if (child.closed) return 'done';
  const normalized = child.status.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!normalized) return 'unset';
  return CHILD_TONES.get(normalized) ?? 'todo';
}

/** The glyph category a tone draws as. */
export function epicChildCategory(tone: EpicChildTone): WorkStateCategory {
  if (tone === 'done') return 'done';
  if (tone === 'progress') return 'in_progress';
  if (tone === 'backlog' || tone === 'triage') return 'backlog';
  return 'todo';
}

/**
 * The children waiting on a human. The epic card shows the count while folded,
 * so the board says who is blocked without anything being opened.
 */
export function epicChildrenNeedingYou(
  epic: WorkItemEpic
): readonly WorkItemChild[] {
  return epic.children.filter(child => epicChildTone(child) === 'attention');
}

/**
 * True when a card should wear the attention rail: either the item is itself
 * waiting on a human, or it is an epic holding children that are.
 *
 * Both cases matter. A standalone bug parked in Needs-you is the work; an epic
 * in Working whose gate child needs a decision is the same signal one level
 * down, and folding it away must not hide that.
 */
export function workItemNeedsYou(item: WorkItem): boolean {
  if (item.stateCategory === 'done' || item.stateCategory === 'canceled') {
    return false;
  }
  const own = epicChildTone({
    key: item.locator,
    title: item.title,
    url: item.url,
    closed: false,
    status: item.status
  });
  if (own === 'attention') return true;
  return item.epic ? epicChildrenNeedingYou(item.epic).length > 0 : false;
}

export function epicProgressLabel(epic: WorkItemEpic): string {
  return `${epic.completedChildren} / ${epic.totalChildren} children`;
}

export function epicProgressPercent(epic: WorkItemEpic): number {
  if (epic.totalChildren <= 0) return 0;
  const ratio = epic.completedChildren / epic.totalChildren;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * Children repeat their epic's prefix ("Timeline: pure C seams"); drop it so
 * the narrow card shows the part that differs.
 */
export function epicChildTitle(title: string, parentTitle?: string): string {
  const trimmed = title.trim();
  const prefix = parentTitle?.split(':')[0]?.trim();
  const own = trimmed.split(':')[0]?.trim();
  const stripped =
    prefix && own && prefix.toLocaleLowerCase() === own.toLocaleLowerCase()
      ? trimmed.slice(trimmed.indexOf(':') + 1).trim()
      : trimmed;
  return stripped.length > 0 ? stripped : trimmed;
}

/** Short issue reference (#12) for a locator like owner/repo#12. */
export function shortItemReference(key: string): string {
  const hash = key.lastIndexOf('#');
  return hash === -1 ? key : key.slice(hash);
}

export function pullRequestFooterText(
  pullRequest: WorkItemPullRequest
): string {
  return `PR #${pullRequest.number} · ${pullRequest.state} · ${pullRequest.branch}`;
}

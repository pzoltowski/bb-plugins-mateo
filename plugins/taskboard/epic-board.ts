import type { WorkItem, WorkItemEpic, WorkItemPullRequest } from './contract.js';

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
  | 'area'
  | 'bug'
  | 'decision'
  | 'neutral';

/** Colour group for a label chip, mirroring the playbook's board rendering. */
export function labelChipTone(label: string): LabelChipTone {
  const normalized = label.trim().toLocaleLowerCase();
  const value = normalized.includes(':')
    ? normalized.slice(normalized.indexOf(':') + 1).trim()
    : normalized;
  if (value === 'bug' || value === 'defect') return 'bug';
  if (value === 'decision' || value === 'adr') return 'decision';
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

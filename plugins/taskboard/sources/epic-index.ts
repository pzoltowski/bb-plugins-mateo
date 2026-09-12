import type { WorkItemEpic, WorkItemPullRequest } from '../contract.js';

/**
 * The hierarchy facts one item contributes, independent of the tracker they
 * came from. Shared by every source that can report a parent/child structure
 * (GitHub Projects today, Linear next).
 */
export interface EpicSourceItem {
  readonly locator: string;
  readonly title: string;
  readonly url: string;
  readonly closed: boolean;
  readonly status: string;
  readonly parentLocator: string | null;
  readonly subIssues: { total: number; completed: number } | null;
  readonly pullRequest: WorkItemPullRequest | null;
  /** Order children inside the folded card; the tracker's own numbering. */
  readonly sortOrder: number;
}

/**
 * Build one epic record per item: its parent, the children the board knows
 * about, and the completed/total counts. A tracker's own sub-issue summary
 * wins over the visible children, because children can live off the board.
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
      .sort((left, right) => left.sortOrder - right.sortOrder)
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
        closed: child.closed,
        status: child.status
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

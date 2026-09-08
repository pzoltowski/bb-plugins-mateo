import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const stylesheet = await readFile(
  new URL('../app.css', import.meta.url),
  'utf8'
);

function ruleBody(pattern: RegExp, label: string): string {
  const match = stylesheet.match(pattern);
  assert.ok(match?.[1], `Missing ${label} rule`);
  return match[1];
}

test('keeps structural headers on neutral host theme surfaces', () => {
  const listHeader = ruleBody(
    /\.tb-group-heading,\s*\.tb-project-strip\s*\{([^}]*)\}/s,
    'list header'
  );
  const kanbanColumn = ruleBody(
    /\.tb-kanban-column\[data-state-category\]\s*\{([^}]*)\}/s,
    'Kanban column'
  );
  const kanbanHeader = ruleBody(
    /\.tb-kanban-column\[data-state-category\]\s+\.tb-kanban-column-header\s*\{([^}]*)\}/s,
    'Kanban header'
  );

  assert.match(
    listHeader,
    /background:\s*var\(--surface-recessed-soft-solid\)/
  );
  assert.doesNotMatch(listHeader, /--tb-state-accent/);
  assert.doesNotMatch(
    stylesheet,
    /\.tb-group-heading\[data-status-tone\]\s*\{/
  );

  for (const rule of [kanbanColumn, kanbanHeader]) {
    assert.match(
      rule,
      /background:\s*var\(--surface-recessed-soft-solid\)/
    );
    assert.doesNotMatch(rule, /--tb-state-accent/);
  }
  assert.match(kanbanColumn, /border-color:\s*var\(--tb-border\)/);
  assert.match(kanbanHeader, /box-shadow:[^;]*var\(--tb-border\)/s);
});

test('uses restrained state glyph, focus, and conversation treatments', () => {
  const stateGlyph = ruleBody(
    /\.tb-state-glyph\s*\{([^}]*)\}/s,
    'state glyph'
  );
  const commentRail = ruleBody(
    /\.tb-comment-rail\s*>\s*div\s*\{([^}]*)\}/s,
    'comment rail'
  );

  assert.match(stateGlyph, /color:\s*var\(--tb-state-accent\)/u);
  assert.match(commentRail, /box-shadow:\s*inset 1px 0 0/u);
  assert.match(stylesheet, /\.tb-item-row:hover,\s*\.tb-item-row:focus-within/u);
  assert.doesNotMatch(
    stylesheet,
    /\.tb-group-heading\[data-state-category\][^{]*\{[^}]*inset 2px/u
  );
  assert.match(stylesheet, /\.tb-comment-entry::before/u);
  assert.match(stylesheet, /\.tb-search-shell:focus-within/u);
});

test('keeps constrained filter values inside the vertical menu measure', () => {
  const filterValues = ruleBody(
    /\[data-taskboard-filter-values\] \[role='menuitemcheckbox'\]\s*\{([^}]*)\}/s,
    'constrained filter values'
  );

  assert.match(filterValues, /min-width:\s*0/u);
  assert.match(filterValues, /white-space:\s*normal/u);
  assert.match(filterValues, /overflow-wrap:\s*anywhere/u);
});

test('keeps assignee avatars compact with six theme-safe identity tones', () => {
  const avatar = ruleBody(
    /\.tb-assignee-mark\s*\{([^}]*)\}/s,
    'assignee avatar'
  );

  assert.match(avatar, /inline-size:\s*20px/u);
  assert.match(avatar, /block-size:\s*20px/u);
  assert.match(avatar, /box-sizing:\s*border-box/u);
  assert.match(avatar, /min-inline-size:\s*20px/u);
  assert.match(avatar, /min-block-size:\s*20px/u);
  assert.match(avatar, /max-inline-size:\s*20px/u);
  assert.match(avatar, /max-block-size:\s*20px/u);
  assert.match(avatar, /flex:\s*0 0 20px/u);
  assert.match(avatar, /font-size:\s*9px/u);
  assert.match(avatar, /font-weight:\s*700/u);
  assert.match(avatar, /color-mix\(in oklch/u);
  assert.match(avatar, /radial-gradient/u);
  for (const tone of ['violet', 'blue', 'teal', 'amber', 'rose', 'slate']) {
    assert.match(
      stylesheet,
      new RegExp(`\\.tb-assignee-mark\\[data-assignee-tone='${tone}'\\]`)
    );
  }
  assert.match(
    stylesheet,
    /@container \(max-width: 36rem\)[\s\S]*?\.tb-item-row \.tb-assignee-mark\s*\{\s*display:\s*none;/u
  );
});

test('shows restrained composer drop feedback and discoverable drag grips', () => {
  const dropTarget = ruleBody(
    /form\[data-taskboard-composer-drop-target='active'\]\s*\{([^}]*)\}/s,
    'composer drop target'
  );
  const cue = ruleBody(/\.tb-composer-drop-cue\s*\{([^}]*)\}/s, 'drop cue');

  assert.match(dropTarget, /outline:\s*2px dashed var\(--input\)/u);
  assert.match(cue, /pointer-events:\s*none/u);
  assert.match(cue, /background:\s*var\(--canvas\)/u);
  assert.match(cue, /color:\s*var\(--ink\)/u);
  assert.match(stylesheet, /\.tb-composer-drag-grip/u);
  assert.match(
    stylesheet,
    /\.tb-item-row\[data-composer-drag='true'\][\s\S]*?grid-template-columns/u
  );
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tb-composer-drag-grip/u
  );
});

test('styles epic chips and child rows on theme tokens only', () => {
  const chip = ruleBody(/\.tb-label-chip\s*\{([^}]*)\}/s, 'label chip');
  assert.match(chip, /border-radius:\s*6px/);
  assert.match(chip, /border:\s*0/);
  assert.match(chip, /font-size:\s*10\.5px/);
  assert.match(chip, /font-weight:\s*400/);
  assert.match(chip, /line-height:\s*15px/);
  assert.match(chip, /letter-spacing:\s*0\.01em/);
  assert.match(chip, /padding:\s*1px 6px/);
  assert.match(chip, /background:\s*var\(--tb-chip-bg\)/);
  assert.match(chip, /color:\s*var\(--tb-chip-fg\)/);
  // The approved badge palette is literal; it lives in the token block only.
  const tokens = ruleBody(/\.tb-linear\s*\{([^}]*)\}/s, 'taskboard tokens');
  for (const token of [
    '--tb-chip-type-bg: #1f2432',
    '--tb-chip-type-fg: #8ea8ff',
    '--tb-chip-area-bg: #202020',
    '--tb-chip-area-fg: #979eaa',
    '--tb-chip-bug-bg: #2b1e1b',
    '--tb-chip-bug-fg: #e0705a',
    '--tb-chip-decision-bg: #271f2a',
    '--tb-chip-decision-fg: #be84cf',
    '--tb-chip-feature-bg: #1a2a29',
    '--tb-chip-feature-fg: #6fc3b8',
    '--tb-chip-spike-bg: #2a2418',
    '--tb-chip-spike-fg: #d9b45a',
    '--tb-chip-polish-bg: #2a1f26',
    '--tb-chip-polish-fg: #d08fb0',
    '--tb-child-number: #3b82c4',
    '--tb-epic-title: #c1c1c1',
    '--tb-child-done: #b7b7b7',
    '--tb-child-open: #858585',
    '--tb-epic-footer: #b7b7b7'
  ]) {
    assert.ok(tokens.includes(token), `Missing ${token}`);
  }

  const doneChild = ruleBody(
    /\.tb-epic-child\[data-child-state='closed'\]\s*\{([^}]*)\}/s,
    'done child'
  );
  assert.match(doneChild, /border-left-color:\s*var\(--tb-green\)/);
  assert.match(
    doneChild,
    /color:\s*var\(--tb-child-done\)/
  );

  const openChild = ruleBody(/\.tb-epic-child\s*\{([^}]*)\}/s, 'open child');
  assert.match(openChild, /color:\s*var\(--tb-child-open\)/);

  const childNumber = ruleBody(
    /\.tb-epic-child\s+\.tb-key\s*\{([^}]*)\}/s,
    'child number'
  );
  assert.match(childNumber, /color:\s*var\(--tb-child-number\)/);

  // The synthetic no-status column reads grey, not Backlog's purple.
  assert.match(
    stylesheet,
    /\[data-status-tone='unset'\]\s*\{[^}]*--tb-state-accent:\s*var\(--tb-slate\)/s
  );
  assert.match(
    stylesheet,
    /\[data-status-tone='unset'\]\s+\.tb-state-glyph\s*\{[^}]*color:\s*var\(--tb-slate\)/s
  );
  // A board's in-progress column reads yellow.
  assert.match(
    stylesheet,
    /\[data-status-tone='progress'\]\s*\{[^}]*--tb-state-accent:\s*var\(--tb-amber\)/s
  );

  const row = ruleBody(/\.tb-epic-progress-row\s*\{([^}]*)\}/s, 'progress row');
  assert.match(row, /cursor:\s*pointer/);
  assert.match(
    stylesheet,
    /\.tb-epic-progress-row:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--state-hover\)/s
  );
  // Outside the token block the epic surface stays literal-colour free.
  assert.doesNotMatch(chip, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(doneChild, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(childNumber, /#[0-9a-f]{3,8}/i);
});

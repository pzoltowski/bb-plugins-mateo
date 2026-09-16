import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  MAX_ICON_BYTES,
  resolveAllProjectIcons,
  resolveProjectIcon,
} from "../lib/project-icons.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const SVG = "<svg xmlns='http://www.w3.org/2000/svg'></svg>";

function project(
  root: string | null,
  overrides: Record<string, unknown> = {},
): Parameters<typeof resolveAllProjectIcons>[0][number] {
  return {
    id: "p1",
    kind: "git",
    sources:
      root === null
        ? []
        : [{ isDefault: true, path: root, type: "local_path" }],
    ...overrides,
  } as Parameters<typeof resolveAllProjectIcons>[0][number];
}

describe("resolveProjectIcon", () => {
  it("prefers favicon.svg and returns a bounded data URL", async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "dockside-icon-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(path.join(root, "favicon.svg"), SVG);
    await writeFile(path.join(root, "icon.png"), PNG);

    const dataUrl = await resolveProjectIcon(root);
    assert.ok(dataUrl !== null);
    assert.ok(dataUrl.startsWith("data:image/svg+xml;base64,"));
    assert.equal(
      Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8"),
      SVG,
    );
  });

  it("falls through the allowlist and honors app.json expo.icon", async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "dockside-icon-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(path.join(root, "app.json"), JSON.stringify({
      expo: { icon: "./assets/icon.png" },
    }));
    await rm(path.join(root, "assets"), { recursive: true, force: true });
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "assets", "icon.png"), PNG);

    const dataUrl = await resolveProjectIcon(root);
    assert.ok(dataUrl?.startsWith("data:image/png;base64,"));
  });

  it("rejects missing, oversized, and non-image files", async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "dockside-icon-"));
    t.after(() => rm(root, { recursive: true, force: true }));

    assert.equal(await resolveProjectIcon(root), null);
    await writeFile(path.join(root, "favicon.txt"), SVG);
    assert.equal(await resolveProjectIcon(root), null);
    await writeFile(path.join(root, "favicon.png"), Buffer.alloc(MAX_ICON_BYTES + 1));
    assert.equal(await resolveProjectIcon(root), null);
  });

  it("cannot escape the project root via app.json or symlinks", async (t) => {
    const outside = await mkdtemp(path.join(tmpdir(), "dockside-outside-"));
    const root = path.join(outside, "proj");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(root);
    t.after(() => rm(outside, { recursive: true, force: true }));
    await writeFile(path.join(outside, "secret.png"), PNG);

    await writeFile(path.join(root, "app.json"), JSON.stringify({
      expo: { icon: "../secret.png" },
    }));
    assert.equal(await resolveProjectIcon(root), null);

    await rm(path.join(root, "app.json"));
    await symlink(path.join(outside, "secret.png"), path.join(root, "favicon.png"));
    assert.equal(await resolveProjectIcon(root), null);
  });

  it("returns null for missing or overlong roots", async () => {
    assert.equal(await resolveProjectIcon(path.join(tmpdir(), "nope-dockside")), null);
    assert.equal(await resolveProjectIcon(""), null);
    assert.equal(await resolveProjectIcon("x".repeat(2000)), null);
  });
});

describe("resolveAllProjectIcons", () => {
  it("skips personal projects and projects without a local source", async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "dockside-icon-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(path.join(root, "favicon.png"), PNG);

    const rows = await resolveAllProjectIcons([
      project(root, { id: "personal", kind: "personal" }),
      project(null, { id: "no-source" }),
      project(root, {
        id: "remote",
        sources: [{ isDefault: true, path: root, type: "github" }],
      }),
      project(root, { id: "kept" }),
    ]);
    assert.deepEqual(rows.map((row) => row.projectId), ["kept"]);
    assert.ok(rows[0].dataUrl.startsWith("data:image/png;base64,"));
  });
});

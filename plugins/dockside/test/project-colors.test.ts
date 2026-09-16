import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROJECT_BADGE_PALETTE,
  automaticProjectColor,
  bestBadgeForeground,
  canonicalProjectColor,
  contrastRatio,
  projectBadgeLetter,
  projectBadgePresentation,
  projectBadgeText,
  validProjectId,
} from "../lib/project-colors.ts";

describe("project badge colors", () => {
  it("selects a stable palette color from the rendered badge text", () => {
    const first = automaticProjectColor("TA");
    assert.ok(PROJECT_BADGE_PALETTE.some((color) => color === first));
    assert.equal(automaticProjectColor("TA"), first);
    assert.equal(
      projectBadgePresentation("TA", undefined).backgroundColor,
      projectBadgePresentation("TA", undefined).backgroundColor,
    );
    assert.equal(projectBadgeLetter("  Alpha"), "A");
    assert.equal(projectBadgeLetter("Beta"), "B");
    assert.equal(projectBadgeLetter("  "), "?");
  });

  it("derives one-letter badges from the first token", () => {
    assert.equal(projectBadgeText("taskboard", 1), "T");
    assert.equal(projectBadgeText("  Alpha Project ", 1), "A");
    assert.equal(projectBadgeText("bb-plugins-mateo", 1), "B");
    assert.equal(projectBadgeText("  ", 1), "?");
    assert.equal(projectBadgeText("!!!", 1), "?");
  });

  it("derives two-letter badges from initials of the first two tokens", () => {
    assert.equal(projectBadgeText("BB Plugins", 2), "BP");
    assert.equal(projectBadgeText("bb-plugins-mateo", 2), "BP");
    assert.equal(projectBadgeText("bb_plugins mateo", 2), "BP");
    assert.equal(projectBadgeText("a.b.c", 2), "AB");
    assert.equal(projectBadgeText("Żabka Max", 2), "ŻM");
  });

  it("derives two-letter badges from a single word and pads safely", () => {
    assert.equal(projectBadgeText("taskboard", 2), "TA");
    assert.equal(projectBadgeText("x", 2), "X?");
    assert.equal(projectBadgeText("  ", 2), "??");
    assert.equal(projectBadgeText("!!!", 2), "??");
    assert.equal(projectBadgeText("42", 2), "42");
  });

  it("accepts only canonicalizable opaque six-digit hex overrides", () => {
    assert.equal(canonicalProjectColor(" #a1b2c3 "), "#A1B2C3");
    for (const invalid of [
      "#fff",
      "#11223344",
      "red",
      "var(--primary)",
      "#GG0000",
      "",
      true,
      null,
    ]) {
      assert.equal(canonicalProjectColor(invalid), null);
    }
  });

  it("uses a valid override and otherwise restores the automatic color", () => {
    const automatic = projectBadgePresentation("PA", null);
    const custom = projectBadgePresentation("PA", "#abcdef");
    assert.equal(custom.backgroundColor, "#ABCDEF");
    assert.equal(custom.isCustom, true);
    assert.equal(automatic.isCustom, false);
    assert.equal(
      projectBadgePresentation("PA", "not-css").backgroundColor,
      automatic.backgroundColor,
    );
  });

  it("chooses the stronger black or white contrast at and around crossover", () => {
    for (const background of [
      "#000000",
      "#FFFFFF",
      "#747474",
      "#757575",
      "#777777",
      ...PROJECT_BADGE_PALETTE,
    ]) {
      const selected = bestBadgeForeground(background);
      const rejected = selected === "#000000" ? "#FFFFFF" : "#000000";
      assert.ok(
        contrastRatio(background, selected) >=
          contrastRatio(background, rejected),
      );
      assert.ok(contrastRatio(background, selected) >= 4.5);
    }
  });

  it("bounds project ids and rejects control characters", () => {
    assert.equal(validProjectId("project-1"), true);
    assert.equal(validProjectId(""), false);
    assert.equal(validProjectId("a".repeat(201)), false);
    assert.equal(validProjectId("project\n1"), false);
  });
});

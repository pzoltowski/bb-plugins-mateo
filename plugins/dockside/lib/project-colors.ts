export const PROJECT_BADGE_PALETTE = [
  "#2563EB",
  "#7C3AED",
  "#C026D3",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#059669",
  "#0891B2",
  "#0284C7",
  "#4F46E5",
] as const;

export const MAX_PROJECT_COLOR_ROWS = 500;
export const MAX_PROJECT_ID_LENGTH = 200;

const HEX_COLOR = /^#[0-9A-F]{6}$/;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;

export interface ProjectBadgePresentation {
  backgroundColor: string;
  foregroundColor: "#000000" | "#FFFFFF";
  isCustom: boolean;
}

export function canonicalProjectColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return HEX_COLOR.test(normalized) ? normalized : null;
}

export function validProjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PROJECT_ID_LENGTH &&
    !CONTROL_CHARACTER.test(value)
  );
}

export function automaticProjectColor(badgeText: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < badgeText.length; index += 1) {
    hash ^= badgeText.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return PROJECT_BADGE_PALETTE[(hash >>> 0) % PROJECT_BADGE_PALETTE.length];
}

export function projectBadgePresentation(
  badgeText: string,
  override: unknown,
): ProjectBadgePresentation {
  const canonicalOverride = canonicalProjectColor(override);
  const backgroundColor =
    canonicalOverride ?? automaticProjectColor(badgeText);
  return {
    backgroundColor,
    foregroundColor: bestBadgeForeground(backgroundColor),
    isCustom: canonicalOverride !== null,
  };
}

export type ProjectBadgeLetterCount = 1 | 2;

export function projectBadgeText(
  name: string,
  count: ProjectBadgeLetterCount,
): string {
  const tokens = name
    .trim()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
  const first = (token: string | undefined): string =>
    token === undefined ? "?" : (Array.from(token)[0] ?? "?");
  if (count === 1) return first(tokens[0]).toLocaleUpperCase();
  if (tokens.length >= 2) {
    return `${first(tokens[0])}${first(tokens[1])}`.toLocaleUpperCase();
  }
  const chars = Array.from(tokens[0] ?? "");
  return (chars.slice(0, 2).join("") || "?")
    .padEnd(2, "?")
    .toLocaleUpperCase();
}

export function projectBadgeLetter(name: string): string {
  return projectBadgeText(name, 1);
}

export function contrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function bestBadgeForeground(
  backgroundColor: string,
): "#000000" | "#FFFFFF" {
  return contrastRatio(backgroundColor, "#000000") >=
    contrastRatio(backgroundColor, "#FFFFFF")
    ? "#000000"
    : "#FFFFFF";
}

function relativeLuminance(color: string): number {
  const canonical = canonicalProjectColor(color);
  if (canonical === null) return 0;
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(canonical.slice(offset, offset + 2), 16),
  );
  const [red, green, blue] = channels.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

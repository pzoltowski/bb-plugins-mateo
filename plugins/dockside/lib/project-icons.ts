// Server-only: probes a project's local source directory for a favicon/icon
// file and returns it as a bounded data URL. Never throws — every failure
// resolves to "no icon" and the badge falls back to letters.
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const MAX_ICON_BYTES = 256 * 1024;
// 256 KiB → ~349 KiB of base64; headroom for the data: prefix.
export const MAX_ICON_DATA_URL_LENGTH = 384 * 1024;
export const MAX_PROJECT_ICON_ROWS = 500;
const MAX_APP_JSON_BYTES = 512 * 1024;
const MAX_ICON_REF_LENGTH = 300;

const ICON_MIME: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

// Probed in order; the first readable, in-bounds hit wins.
const ICON_CANDIDATES = [
  "favicon.svg",
  "favicon.png",
  "favicon.ico",
  "favicon.gif",
  "favicon.webp",
  "icon.svg",
  "icon.png",
  "logo.svg",
  "logo.png",
  "apple-touch-icon.png",
  "public/favicon.svg",
  "public/favicon.png",
  "public/favicon.ico",
  "static/favicon.svg",
  "static/favicon.png",
  "static/favicon.ico",
  "src-tauri/icons/icon.png",
  "src-tauri/icons/32x32.png",
] as const;

const MAX_SOURCE_ROOT_LENGTH = 1_000;

async function readIconFile(
  realRoot: string,
  relativePath: string,
): Promise<string | null> {
  const absolute = path.resolve(realRoot, relativePath);
  if (!absolute.startsWith(realRoot + path.sep)) return null;
  const mime = ICON_MIME[path.extname(absolute).toLowerCase()];
  if (mime === undefined) return null;
  try {
    // A committed symlink (favicon.png -> /etc/passwd) must not leave the
    // project; realpath on both sides keeps the comparison honest.
    const real = await realpath(absolute);
    if (!real.startsWith(realRoot + path.sep)) return null;
    const info = await stat(real);
    if (!info.isFile() || info.size === 0 || info.size > MAX_ICON_BYTES) {
      return null;
    }
    const bytes = await readFile(real);
    if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// Expo/React Native projects declare their app icon in app.json; that field is
// a configured icon, so it is checked after the conventional favicon files.
async function appJsonIcon(realRoot: string): Promise<string | null> {
  let iconPath: unknown;
  try {
    const absolute = path.resolve(realRoot, "app.json");
    const info = await stat(absolute);
    if (!info.isFile() || info.size > MAX_APP_JSON_BYTES) return null;
    const parsed: unknown = JSON.parse(await readFile(absolute, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const expo = (parsed as Record<string, unknown>).expo;
    iconPath =
      (typeof expo === "object" && expo !== null
        ? (expo as Record<string, unknown>).icon
        : undefined) ?? (parsed as Record<string, unknown>).icon;
  } catch {
    return null;
  }
  if (
    typeof iconPath !== "string" ||
    iconPath.length === 0 ||
    iconPath.length > MAX_ICON_REF_LENGTH ||
    path.isAbsolute(iconPath)
  ) {
    return null;
  }
  return readIconFile(realRoot, iconPath);
}

export async function resolveProjectIcon(
  sourceRoot: string,
): Promise<string | null> {
  if (
    typeof sourceRoot !== "string" ||
    sourceRoot.length === 0 ||
    sourceRoot.length > MAX_SOURCE_ROOT_LENGTH
  ) {
    return null;
  }
  let realRoot: string;
  try {
    realRoot = await realpath(sourceRoot);
  } catch {
    return null;
  }
  for (const candidate of ICON_CANDIDATES) {
    const dataUrl = await readIconFile(realRoot, candidate);
    if (dataUrl !== null) return dataUrl;
  }
  return appJsonIcon(realRoot);
}

export interface ProjectIconSource {
  id: string;
  kind: string;
  sources: readonly {
    isDefault: boolean;
    path: string;
    type: string;
  }[];
}

export async function resolveAllProjectIcons(
  projects: readonly ProjectIconSource[],
): Promise<{ projectId: string; dataUrl: string }[]> {
  const icons: { projectId: string; dataUrl: string }[] = [];
  for (const project of projects) {
    if (icons.length >= MAX_PROJECT_ICON_ROWS) break;
    if (project.kind === "personal") continue;
    const source =
      project.sources.find((entry) => entry.isDefault) ?? project.sources[0];
    if (source === undefined || source.type !== "local_path") continue;
    const dataUrl = await resolveProjectIcon(source.path);
    if (dataUrl !== null) icons.push({ projectId: project.id, dataUrl });
  }
  return icons;
}

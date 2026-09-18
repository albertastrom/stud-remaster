import { DEFAULT_SETTINGS } from "./defaults";
import type { AllowEntry, Settings } from "./types";

const SETTINGS_KEY = "stud.settings.v1";

function mergeSettings(raw: unknown): Settings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<Settings>;
  return {
    apiKey: typeof value.apiKey === "string" ? value.apiKey : base.apiKey,
    mode: value.mode === "study" || value.mode === "free" ? value.mode : base.mode,
    workContext:
      typeof value.workContext === "string" ? value.workContext : base.workContext,
    pins: Array.isArray(value.pins) ? value.pins : base.pins,
    allowlist: Array.isArray(value.allowlist) ? value.allowlist : base.allowlist,
    thresholds: { ...base.thresholds, ...(value.thresholds ?? {}) },
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export function upsertAllowEntry(
  list: AllowEntry[],
  entry: AllowEntry,
): AllowEntry[] {
  const without = list.filter(
    (item) =>
      !(item.contextHash === entry.contextHash && item.key === entry.key),
  );
  return [...without, entry];
}

export function pruneAllowlist(
  list: AllowEntry[],
  contextHash: string,
): AllowEntry[] {
  const maxAge = 1000 * 60 * 60 * 24 * 14;
  const now = Date.now();
  return list.filter((item) => {
    if (now - item.at > maxAge) return false;
    if (item.contextHash !== contextHash && item.source === "jev") {
      return now - item.at < 1000 * 60 * 60 * 24;
    }
    return true;
  });
}

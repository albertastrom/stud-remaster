import { DEFAULT_SETTINGS, HOLD_TTL_MS } from "./defaults";
import type { AllowEntry, Settings } from "./types";

const SETTINGS_KEY = "stud.settings.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

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
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY]);
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialized read-modify-write so concurrent scans and popup edits never drop each other's changes. */
export function updateSettings(patch: (current: Settings) => Settings): Promise<Settings> {
  const run = queue.then(async () => {
    const next = patch(await loadSettings());
    await browser.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function upsertAllowEntries(list: AllowEntry[], entries: AllowEntry[]): AllowEntry[] {
  const replaced = new Set(entries.map((e) => `${e.contextHash}|${e.key}`));
  return [...list.filter((item) => !replaced.has(`${item.contextHash}|${item.key}`)), ...entries];
}

export function pruneAllowlist(list: AllowEntry[], contextHash: string): AllowEntry[] {
  const now = Date.now();
  return list.filter((item) => {
    const age = now - item.at;
    if (age > 14 * DAY_MS) return false;
    if (item.verdict === "hold" && age > HOLD_TTL_MS) return false;
    if (item.contextHash !== contextHash && item.source === "jev") return age < DAY_MS;
    return true;
  });
}

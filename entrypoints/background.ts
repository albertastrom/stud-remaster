import { BATCH_SIZE, HOLD_TTL_MS, SCAN_ALARM } from "../lib/defaults";
import { cacheScope, composeVerdict, verdictReason } from "../lib/compose";
import { buildTabQuestions, sessionState } from "../lib/questions";
import {
  loadSettings,
  pruneAllowlist,
  saveSettings,
  upsertAllowEntry,
} from "../lib/storage";
import { readNoul, systemOne, TypeSafeHttpError } from "../lib/typesafe";
import type {
  AllowEntry,
  BackgroundToPopup,
  GateMessage,
  LiveState,
  PinKind,
  PopupToBackground,
  Settings,
  TabRecord,
  Verdict,
} from "../lib/types";
import { hashContext, hostKey, parseTabUrl, samePage, urlKey } from "../lib/url";

const tabRecords = new Map<number, TabRecord>();
let lastError: string | null = null;
let judging = false;
let rescanNeeded = false;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let lastAllowedTabId: number | null = null;

function publicState(settings: Settings, extras: Omit<LiveState, "settings" | "hasApiKey">): LiveState {
  return {
    settings: { ...settings, apiKey: "" },
    hasApiKey: Boolean(settings.apiKey),
    ...extras,
  };
}

function broadcastState(state: LiveState) {
  void browser.runtime.sendMessage({ type: "STATE", state } satisfies BackgroundToPopup).catch(
    () => undefined,
  );
}

async function snapshot(): Promise<LiveState> {
  const settings = await loadSettings();
  const contextHash = settings.workContext
    ? await hashContext(settings.workContext)
    : "";
  return publicState(settings, {
    tabs: [...tabRecords.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    contextHash,
    lastError,
    judging,
  });
}

async function pushState() {
  broadcastState(await snapshot());
}

function setBadge(mode: Settings["mode"], blocked: number) {
  const text = mode === "study" ? (blocked > 0 ? String(blocked) : "ON") : "";
  void browser.action.setBadgeText({ text });
  void browser.action.setBadgeBackgroundColor({
    color: mode === "study" ? "#0F766E" : "#9CA3AF",
  });
}

async function notifyTab(record: TabRecord, workContext: string) {
  const message: GateMessage = {
    type: "STUD_GATE",
    verdict: record.verdict,
    workContext,
    host: record.host,
    reason: record.reason,
  };
  try {
    await browser.tabs.sendMessage(record.tabId, message);
  } catch {
    // chrome:// and discarded tabs have no content script
  }
}

function lookupCache(
  settings: Settings,
  contextHash: string,
  host: string,
  pathname: string,
  search = "",
): AllowEntry | undefined {
  const exact = urlKey(host, pathname, search);
  const hostOnly = hostKey(host);
  const now = Date.now();
  const fresh = (item: AllowEntry) =>
    item.verdict !== "hold" || now - item.at < HOLD_TTL_MS;
  return (
    settings.allowlist.find(
      (item) =>
        item.contextHash === contextHash &&
        fresh(item) &&
        item.scope === "url" &&
        item.key === exact,
    ) ??
    settings.allowlist.find(
      (item) =>
        item.contextHash === contextHash &&
        fresh(item) &&
        item.scope === "host" &&
        item.key === hostOnly,
    )
  );
}

function pinFor(settings: Settings, host: string) {
  return settings.pins.find((pin) => pin.host === host);
}

function writeRecord(record: TabRecord) {
  tabRecords.set(record.tabId, record);
}

async function applyVerdict(
  tabId: number,
  parsed: NonNullable<ReturnType<typeof parseTabUrl>>,
  title: string,
  verdict: Verdict | "checking" | "skipped",
  extras: Partial<TabRecord>,
  workContext: string,
) {
  const record: TabRecord = {
    tabId,
    url: parsed.url,
    title,
    host: parsed.host,
    pathname: parsed.pathname,
    verdict,
    updatedAt: Date.now(),
    ...extras,
  };
  writeRecord(record);
  if (verdict === "allow") lastAllowedTabId = tabId;
  if (verdict === "block" && lastAllowedTabId === tabId) lastAllowedTabId = null;
  await notifyTab(record, workContext);
}

type QueryTab = {
  id?: number;
  url?: string;
  title?: string;
};

async function judgeBatch(
  settings: Settings,
  contextHash: string,
  pending: Array<{ tab: QueryTab; parsed: NonNullable<ReturnType<typeof parseTabUrl>> }>,
): Promise<Settings> {
  const tabs = pending.map(({ tab, parsed }) => ({
    title: tab.title ?? parsed.host,
    host: parsed.host,
    url: parsed.url,
    path: parsed.pathname,
  }));
  const response = await systemOne({
    apiKey: settings.apiKey,
    state: sessionState(settings.workContext, tabs),
    questions: buildTabQuestions(tabs.length),
  });

  let next = settings;
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    if (!item || item.tab.id == null) continue;
    const tabId = item.tab.id;
    const { tab, parsed } = item;
    const signals = {
      relevant: readNoul(response.answers, `relevant_${i}`),
      distraction: readNoul(response.answers, `distraction_${i}`),
      workTool: readNoul(response.answers, `work_tool_${i}`),
    };
    const verdict = composeVerdict(signals, settings.thresholds);
    const scope = cacheScope(signals, verdict, settings.thresholds);
    const entry: AllowEntry = {
      key: scope === "host" ? hostKey(parsed.host) : urlKey(parsed.host, parsed.pathname, parsed.search),
      host: parsed.host,
      pathname: parsed.pathname,
      scope,
      verdict,
      signals,
      source: "jev",
      at: Date.now(),
      contextHash,
    };
    next = {
      ...next,
      allowlist: upsertAllowEntry(next.allowlist, entry),
    };

    let live: QueryTab | undefined;
    try {
      live = await browser.tabs.get(tabId);
    } catch {
      live = undefined;
    }
    const liveParsed = parseTabUrl(live?.url);
    if (!liveParsed || !samePage(liveParsed, parsed)) {
      rescanNeeded = true;
      continue;
    }

    await applyVerdict(
      tabId,
      liveParsed,
      live?.title ?? tab.title ?? parsed.host,
      verdict,
      { signals, source: "jev", reason: verdictReason(verdict, signals) },
      settings.workContext,
    );
  }
  next = { ...next, allowlist: pruneAllowlist(next.allowlist, contextHash) };
  await saveSettings(next);
  return next;
}

async function scanAllTabs() {
  if (judging) {
    rescanNeeded = true;
    return;
  }
  judging = true;
  rescanNeeded = false;
  lastError = null;
  try {
    const settings = await loadSettings();
    const tabs = await browser.tabs.query({});
    const contextHash = settings.workContext
      ? await hashContext(settings.workContext)
      : "";
    const pending: Array<{
      tab: QueryTab;
      parsed: NonNullable<ReturnType<typeof parseTabUrl>>;
    }> = [];

    for (const tab of tabs) {
      if (tab.id == null) continue;
      const parsed = parseTabUrl(tab.url);
      if (!parsed) continue;
      if (parsed.internal) {
        await applyVerdict(
          tab.id,
          parsed,
          tab.title ?? parsed.host,
          "skipped",
          { source: "internal", reason: "Browser page." },
          settings.workContext,
        );
        continue;
      }
      if (settings.mode !== "study") {
        await applyVerdict(
          tab.id,
          parsed,
          tab.title ?? parsed.host,
          "skipped",
          { reason: "No session." },
          settings.workContext,
        );
        continue;
      }
      if (!settings.apiKey) {
        await applyVerdict(
          tab.id,
          parsed,
          tab.title ?? parsed.host,
          "skipped",
          { reason: "Add your TypeSafe key first." },
          settings.workContext,
        );
        continue;
      }
      if (!settings.workContext.trim()) {
        await applyVerdict(
          tab.id,
          parsed,
          tab.title ?? parsed.host,
          "skipped",
          { reason: "Say what you are working on first." },
          settings.workContext,
        );
        continue;
      }

      const pin = pinFor(settings, parsed.host);
      if (pin) {
        await applyVerdict(
          tab.id,
          parsed,
          tab.title ?? parsed.host,
          pin.kind === "allow" ? "allow" : "block",
          {
            source: "pin",
            reason:
              pin.kind === "allow"
                ? "You allowed this site."
                : "You kept this site off.",
          },
          settings.workContext,
        );
        continue;
      }

      const cached = lookupCache(
        settings,
        contextHash,
        parsed.host,
        parsed.pathname,
        parsed.search,
      );
      if (cached) {
        await applyVerdict(
          tab.id,
          parsed,
          tab.title ?? parsed.host,
          cached.verdict,
          {
            signals: cached.signals,
            source: cached.source,
            reason: verdictReason(cached.verdict, cached.signals),
          },
          settings.workContext,
        );
        continue;
      }

      const existing = tabRecords.get(tab.id);
      if (existing?.verdict !== "block" && existing?.verdict !== "hold") {
        await applyVerdict(
          tab.id,
          parsed,
          tab.title ?? parsed.host,
          "checking",
          { reason: "Checking…" },
          settings.workContext,
        );
      }
      pending.push({ tab, parsed });
    }

    let current = settings;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      current = await judgeBatch(
        current,
        contextHash,
        pending.slice(i, i + BATCH_SIZE),
      );
    }

    const blocked = [...tabRecords.values()].filter(
      (record) => record.verdict === "block",
    ).length;
    setBadge(settings.mode, blocked);
  } catch (error) {
    if (error instanceof TypeSafeHttpError && error.status === 401) {
      lastError = "TypeSafe API key was rejected.";
    } else {
      lastError = error instanceof Error ? error.message : "Judging failed.";
      if (!(error instanceof TypeSafeHttpError && error.status === 401)) {
        rescanNeeded = true;
      }
    }
  } finally {
    judging = false;
    await pushState();
    if (rescanNeeded) {
      rescanNeeded = false;
      scheduleScan();
    }
  }
}

function scheduleScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    void scanAllTabs();
  }, 280);
}

async function mutateSettings(patch: (current: Settings) => Settings) {
  const current = await loadSettings();
  await saveSettings(patch(current));
  scheduleScan();
  await pushState();
}

export default defineBackground(() => {
  void browser.alarms.create(SCAN_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SCAN_ALARM) void scanAllTabs();
  });

  browser.tabs.onUpdated.addListener((_id, change, tab) => {
    if (change.url || change.status === "complete" || change.title) {
      if (tab.id != null && change.url) tabRecords.delete(tab.id);
      scheduleScan();
    }
  });
  browser.tabs.onActivated.addListener(() => scheduleScan());
  browser.tabs.onRemoved.addListener((tabId) => {
    tabRecords.delete(tabId);
    if (lastAllowedTabId === tabId) lastAllowedTabId = null;
    void pushState();
  });

  browser.runtime.onMessage.addListener(
    (message: PopupToBackground | GateMessage, sender) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return;
      }

      const fromTab = sender.tab != null;
      const privileged =
        message.type === "SET_MODE" ||
        message.type === "SET_CONTEXT" ||
        message.type === "SET_API_KEY" ||
        message.type === "PIN_HOST" ||
        message.type === "UNPIN_HOST" ||
        message.type === "REMOVE_ALLOW_ENTRY" ||
        message.type === "RESCAN" ||
        message.type === "OVERRIDE_TAB";
      if (fromTab && privileged) {
        return snapshot();
      }

      if (message.type === "GET_STATE") {
        return snapshot();
      }

      if (message.type === "SET_MODE") {
        return mutateSettings((s) => ({ ...s, mode: message.mode }));
      }
      if (message.type === "SET_CONTEXT") {
        return mutateSettings((s) => ({ ...s, workContext: message.workContext }));
      }
      if (message.type === "SET_API_KEY") {
        return mutateSettings((s) => ({ ...s, apiKey: message.apiKey.trim() }));
      }
      if (message.type === "PIN_HOST") {
        return mutateSettings((s) => ({
          ...s,
          pins: [
            ...s.pins.filter((pin) => pin.host !== message.host),
            { host: message.host, kind: message.kind },
          ],
        }));
      }
      if (message.type === "UNPIN_HOST") {
        return mutateSettings((s) => ({
          ...s,
          pins: s.pins.filter((pin) => pin.host !== message.host),
        }));
      }
      if (message.type === "REMOVE_ALLOW_ENTRY") {
        return mutateSettings((s) => ({
          ...s,
          allowlist: s.allowlist.filter((item) => item.key !== message.key),
        }));
      }
      if (message.type === "RESCAN") {
        return mutateSettings((s) => ({
          ...s,
          allowlist: s.allowlist.filter((item) => item.source !== "jev"),
        }));
      }
      if (message.type === "OVERRIDE_TAB" || message.type === "OVERRIDE_HERE") {
        const tabId =
          message.type === "OVERRIDE_TAB" ? message.tabId : sender.tab?.id;
        if (tabId == null) return snapshot();
        if (message.verdict !== "allow" && message.verdict !== "block") {
          return snapshot();
        }
        const always = Boolean(message.always);
        const kind: PinKind = message.verdict === "allow" ? "allow" : "block";
        return (async () => {
          const tab = await browser.tabs.get(tabId);
          const parsed = parseTabUrl(tab.url);
          if (!parsed) return snapshot();
          if (always) {
            await mutateSettings((s) => ({
              ...s,
              pins: [
                ...s.pins.filter((pin) => pin.host !== parsed.host),
                { host: parsed.host, kind },
              ],
            }));
          } else {
            const settings = await loadSettings();
            const contextHash = settings.workContext
              ? await hashContext(settings.workContext)
              : "";
            const entry: AllowEntry = {
              key: urlKey(parsed.host, parsed.pathname, parsed.search),
              host: parsed.host,
              pathname: parsed.pathname,
              scope: "url",
              verdict: message.verdict,
              signals: { relevant: 0, distraction: 0, workTool: 0 },
              source: "override",
              at: Date.now(),
              contextHash,
            };
            await saveSettings({
              ...settings,
              allowlist: upsertAllowEntry(settings.allowlist, entry),
            });
            await applyVerdict(
              tabId,
              parsed,
              tab.title ?? parsed.host,
              message.verdict,
              {
                source: "override",
                reason:
                  message.verdict === "allow"
                    ? "Allowed for this tab."
                    : "Blocked for this tab.",
              },
              settings.workContext,
            );
            if (
              message.verdict === "block" &&
              lastAllowedTabId != null &&
              lastAllowedTabId !== tabId
            ) {
              void browser.tabs
                .update(lastAllowedTabId, { active: true })
                .catch(() => undefined);
            }
            await pushState();
          }
          return snapshot();
        })();
      }

      if (message.type === "GATE_FOR_ME" && sender.tab?.id != null) {
        const existing = tabRecords.get(sender.tab.id);
        if (existing) {
          void loadSettings().then((settings) =>
            notifyTab(existing, settings.workContext),
          );
        } else {
          scheduleScan();
        }
      }

      return undefined;
    },
  );

  scheduleScan();
});

import { BATCH_SIZE, HOLD_TTL_MS, SCAN_ALARM } from "../lib/defaults";
import { cacheScope, composeVerdict, verdictReason } from "../lib/compose";
import { buildTabQuestions, sessionState } from "../lib/questions";
import {
  loadSettings,
  pruneAllowlist,
  updateSettings,
  upsertAllowEntries,
} from "../lib/storage";
import { readNoul, systemOne, TypeSafeHttpError } from "../lib/typesafe";
import type {
  AllowEntry,
  BackgroundToPopup,
  ContentToBackground,
  GateMessage,
  LiveState,
  PinKind,
  PopupToBackground,
  Settings,
  TabRecord,
  TabVerdict,
} from "../lib/types";
import { hashContext, parseTabUrl, urlKey, type ParsedUrl } from "../lib/url";

type PendingTab = { tabId: number; title: string; parsed: ParsedUrl; gen: number };

const tabRecords = new Map<number, TabRecord>();
const tabGen = new Map<number, number>();
let lastError: string | null = null;
let judging = false;
let rescanNeeded = false;
let scanTimer: ReturnType<typeof setTimeout> | null = null;

async function snapshot(): Promise<LiveState> {
  const settings = await loadSettings();
  return {
    settings: { ...settings, apiKey: "" },
    hasApiKey: Boolean(settings.apiKey),
    tabs: [...tabRecords.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    contextHash: await hashContext(settings.workContext),
    lastError,
    judging,
  };
}

async function pushState() {
  const state = await snapshot();
  const study = state.settings.mode === "study";
  const blocked = state.tabs.filter((tab) => tab.verdict === "block").length;
  void browser.action.setBadgeText({ text: study ? (blocked ? String(blocked) : "ON") : "" });
  void browser.action.setBadgeBackgroundColor({ color: study ? "#0F766E" : "#9CA3AF" });
  void browser.runtime
    .sendMessage({ type: "STATE", state } satisfies BackgroundToPopup)
    .catch(() => undefined);
}

function bumpGen(tabId: number) {
  tabGen.set(tabId, (tabGen.get(tabId) ?? 0) + 1);
}

function forgetTabPage(tabId: number) {
  tabRecords.delete(tabId);
  bumpGen(tabId);
}

async function notifyTab(record: TabRecord, workContext: string) {
  const live = await browser.tabs.get(record.tabId).catch(() => undefined);
  if (parseTabUrl(live?.url)?.url !== record.url) return;
  const message: GateMessage = {
    type: "STUD_GATE",
    verdict: record.verdict,
    workContext,
    host: record.host,
    url: record.url,
    reason: record.reason,
  };
  // chrome:// and discarded tabs have no content script
  await browser.tabs.sendMessage(record.tabId, message).catch(() => undefined);
}

async function setRecord(
  tabId: number,
  parsed: ParsedUrl,
  title: string,
  verdict: TabVerdict,
  reason: string,
  workContext: string,
) {
  const prev = tabRecords.get(tabId);
  const unchanged =
    prev?.url === parsed.url && prev.verdict === verdict && prev.reason === reason;
  const record: TabRecord = {
    tabId,
    url: parsed.url,
    title,
    host: parsed.host,
    verdict,
    reason,
    updatedAt: unchanged ? prev.updatedAt : Date.now(),
  };
  tabRecords.set(tabId, record);
  if (!unchanged) await notifyTab(record, workContext);
}

function lookupCache(allowlist: AllowEntry[], contextHash: string, parsed: ParsedUrl) {
  const now = Date.now();
  const usable = allowlist.filter(
    (item) =>
      item.contextHash === contextHash &&
      (item.verdict !== "hold" || now - item.at < HOLD_TTL_MS),
  );
  const key = urlKey(parsed);
  return (
    usable.find((item) => item.scope === "url" && item.key === key) ??
    usable.find((item) => item.scope === "host" && item.key === parsed.host)
  );
}

/** Verdict without asking Jev, or null when the tab needs judging. */
function localVerdict(
  settings: Settings,
  contextHash: string,
  parsed: ParsedUrl,
): { verdict: TabVerdict; reason: string } | null {
  if (parsed.internal) return { verdict: "skipped", reason: "Browser page." };
  if (settings.mode !== "study") return { verdict: "skipped", reason: "No session." };
  if (!settings.apiKey) return { verdict: "skipped", reason: "Add your TypeSafe key first." };
  if (!contextHash) return { verdict: "skipped", reason: "Say what you are working on first." };

  const pin = settings.pins.find((item) => item.host === parsed.host);
  if (pin) {
    return {
      verdict: pin.kind,
      reason: pin.kind === "allow" ? "You allowed this site." : "You kept this site off.",
    };
  }
  const cached = lookupCache(settings.allowlist, contextHash, parsed);
  if (cached) {
    return { verdict: cached.verdict, reason: verdictReason(cached.verdict, cached.signals) };
  }
  return null;
}

async function judgeBatch(settings: Settings, contextHash: string, pending: PendingTab[]) {
  const response = await systemOne({
    apiKey: settings.apiKey,
    state: sessionState(
      settings.workContext,
      pending.map(({ title, parsed }) => ({ title, host: parsed.host, url: parsed.url })),
    ),
    questions: buildTabQuestions(pending.length),
  });

  const at = Date.now();
  const results = pending.map((item, i) => {
    const signals = {
      relevant: readNoul(response.answers, `relevant_${i}`),
      distraction: readNoul(response.answers, `distraction_${i}`),
      workTool: readNoul(response.answers, `work_tool_${i}`),
    };
    const verdict = composeVerdict(signals);
    const scope = cacheScope(signals, verdict, item.parsed.host);
    const entry: AllowEntry = {
      key: scope === "host" ? item.parsed.host : urlKey(item.parsed),
      host: item.parsed.host,
      scope,
      verdict,
      signals,
      source: "jev",
      at,
      contextHash,
    };
    return { item, entry };
  });

  await updateSettings((s) => ({
    ...s,
    allowlist: pruneAllowlist(
      upsertAllowEntries(s.allowlist, results.map((r) => r.entry)),
      contextHash,
    ),
  }));

  for (const { item, entry } of results) {
    const live = await browser.tabs.get(item.tabId).catch(() => undefined);
    if (!live) continue;
    const liveParsed = parseTabUrl(live.url);
    if (item.gen !== (tabGen.get(item.tabId) ?? 0) || liveParsed?.url !== item.parsed.url) {
      rescanNeeded = true;
      continue;
    }
    await setRecord(
      item.tabId,
      liveParsed,
      live.title || item.title,
      entry.verdict,
      verdictReason(entry.verdict, entry.signals),
      settings.workContext,
    );
  }
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
    const contextHash = await hashContext(settings.workContext);
    const pending: PendingTab[] = [];

    for (const tab of await browser.tabs.query({})) {
      const parsed = parseTabUrl(tab.url);
      if (tab.id == null || !parsed) continue;
      const title = tab.title || parsed.host;
      const local = localVerdict(settings, contextHash, parsed);
      if (local) {
        await setRecord(tab.id, parsed, title, local.verdict, local.reason, settings.workContext);
        continue;
      }
      const existing = tabRecords.get(tab.id)?.verdict;
      if (existing !== "block" && existing !== "hold") {
        await setRecord(tab.id, parsed, title, "checking", "Checking…", settings.workContext);
      }
      pending.push({ tabId: tab.id, title, parsed, gen: tabGen.get(tab.id) ?? 0 });
    }

    const [focused] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const urgent = pending.filter((item) => item.tabId === focused?.id);
    const rest = pending.filter((item) => item.tabId !== focused?.id);
    let urgentError: unknown;
    if (urgent.length) {
      try {
        await judgeBatch(settings, contextHash, urgent);
      } catch (error) {
        urgentError = error;
      }
    }
    if (!(urgentError instanceof TypeSafeHttpError && urgentError.status === 401)) {
      const batches: Promise<void>[] = [];
      for (let i = 0; i < rest.length; i += BATCH_SIZE) {
        batches.push(judgeBatch(settings, contextHash, rest.slice(i, i + BATCH_SIZE)));
      }
      const failed = (await Promise.allSettled(batches)).find((r) => r.status === "rejected");
      if (!urgentError && failed) urgentError = failed.reason;
    }
    if (urgentError) throw urgentError;
  } catch (error) {
    if (error instanceof TypeSafeHttpError && error.status === 401) {
      lastError = "TypeSafe API key was rejected.";
    } else {
      lastError = error instanceof Error ? error.message : "Judging failed.";
    }
  } finally {
    judging = false;
    await pushState();
    if (rescanNeeded) scheduleScan();
  }
}

function scheduleScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => void scanAllTabs(), 50);
}

async function mutateSettings(patch: (current: Settings) => Settings) {
  await updateSettings(patch);
  scheduleScan();
  await pushState();
}

function withPin(settings: Settings, host: string, kind: PinKind): Settings {
  return {
    ...settings,
    pins: [...settings.pins.filter((pin) => pin.host !== host), { host, kind }],
  };
}

async function keepTab(tabId: number, always: boolean) {
  const tab = await browser.tabs.get(tabId);
  const parsed = parseTabUrl(tab.url);
  if (!parsed) return;
  const settings = await loadSettings();
  if (always) {
    await updateSettings((s) => withPin(s, parsed.host, "allow"));
  } else {
    const contextHash = await hashContext(settings.workContext);
    const entry: AllowEntry = {
      key: urlKey(parsed),
      host: parsed.host,
      scope: "url",
      verdict: "allow",
      source: "override",
      at: Date.now(),
      contextHash,
    };
    await updateSettings((s) => ({ ...s, allowlist: upsertAllowEntries(s.allowlist, [entry]) }));
  }
  await setRecord(
    tabId,
    parsed,
    tab.title || parsed.host,
    "allow",
    always ? "You allowed this site." : verdictReason("allow"),
    settings.workContext,
  );
  if (always) scheduleScan();
  await pushState();
}

/** Jump to the most recently used allowed tab and close this one. */
async function leaveTab(tabId: number) {
  const [target] = (await browser.tabs.query({}))
    .filter(
      (tab) => tab.id != null && tab.id !== tabId && tabRecords.get(tab.id)?.verdict === "allow",
    )
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  if (target?.id != null) {
    await browser.tabs.update(target.id, { active: true });
    await browser.windows.update(target.windowId, { focused: true });
  }
  await browser.tabs.remove(tabId);
}

async function handlePopup(message: PopupToBackground): Promise<LiveState> {
  switch (message.type) {
    case "SET_MODE":
      await mutateSettings((s) => ({ ...s, mode: message.mode }));
      break;
    case "SET_CONTEXT":
      await mutateSettings((s) => ({ ...s, workContext: message.workContext.trim() }));
      break;
    case "SET_API_KEY":
      await mutateSettings((s) => ({ ...s, apiKey: message.apiKey.trim() }));
      break;
    case "PIN_HOST":
      await mutateSettings((s) => withPin(s, message.host, message.kind));
      break;
    case "UNPIN_HOST":
      await mutateSettings((s) => ({
        ...s,
        pins: s.pins.filter((pin) => pin.host !== message.host),
      }));
      break;
    case "REMOVE_ALLOW_ENTRY":
      await mutateSettings((s) => ({
        ...s,
        allowlist: s.allowlist.filter((item) => item.key !== message.key),
      }));
      break;
    case "RESCAN":
      await mutateSettings((s) => ({
        ...s,
        allowlist: s.allowlist.filter((item) => item.source !== "jev"),
      }));
      break;
  }
  return snapshot();
}

async function handleContent(message: ContentToBackground, tab: Browser.tabs.Tab) {
  const tabId = tab.id!;
  switch (message.type) {
    case "KEEP":
      return keepTab(tabId, message.always);
    case "LEAVE":
      return leaveTab(tabId);
    case "GATE_FOR_ME": {
      const existing = tabRecords.get(tabId);
      const liveUrl = parseTabUrl(tab.url)?.url;
      if (existing && existing.url === liveUrl) {
        const settings = await loadSettings();
        return notifyTab(existing, settings.workContext);
      }
      if (existing && liveUrl && existing.url !== liveUrl) forgetTabPage(tabId);
      scheduleScan();
    }
  }
}

export default defineBackground(() => {
  void browser.alarms.create(SCAN_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SCAN_ALARM) void scanAllTabs();
  });

  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    const live = parseTabUrl(tab.url);
    const existing = tabRecords.get(tabId);
    if (change.url || (existing && live && existing.url !== live.url)) forgetTabPage(tabId);
    if (change.url || change.status === "complete" || change.title) scheduleScan();
  });
  browser.tabs.onActivated.addListener(() => scheduleScan());
  browser.tabs.onRemoved.addListener((tabId) => {
    forgetTabPage(tabId);
    void pushState();
  });

  browser.runtime.onMessage.addListener(
    (message: PopupToBackground | ContentToBackground, sender, sendResponse) => {
      if (!message || typeof message !== "object" || !("type" in message)) return;
      const result =
        sender.tab?.id != null
          ? handleContent(message as ContentToBackground, sender.tab)
          : handlePopup(message as PopupToBackground);
      result.then(sendResponse, (error: unknown) => {
        console.error(error);
        sendResponse(undefined);
      });
      return true;
    },
  );

  scheduleScan();
});

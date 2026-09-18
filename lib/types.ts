export type Mode = "study" | "free";

export type Verdict = "allow" | "block" | "hold";

export type CacheScope = "host" | "url";

export type PinKind = "allow" | "block";

export type Signals = {
  relevant: number;
  distraction: number;
  workTool: number;
};

export type Thresholds = {
  relevantAllow: number;
  toolAllow: number;
  toolMaxDistraction: number;
  hostBlockDistraction: number;
  hostBlockMaxRelevant: number;
  blockDistraction: number;
  blockMaxRelevant: number;
  noulUncertainLow: number;
  noulUncertainHigh: number;
  leanAllowRelevant: number;
  leanAllowMaxDistraction: number;
  leanBlockDistraction: number;
  leanBlockMaxRelevant: number;
};

export type Pin = {
  host: string;
  kind: PinKind;
};

export type AllowEntry = {
  key: string;
  host: string;
  pathname: string;
  scope: CacheScope;
  verdict: Verdict;
  signals: Signals;
  source: "jev" | "pin" | "override";
  at: number;
  contextHash: string;
};

export type TabRecord = {
  tabId: number;
  url: string;
  title: string;
  host: string;
  pathname: string;
  verdict: Verdict | "checking" | "skipped";
  signals?: Signals;
  source?: AllowEntry["source"] | "internal";
  reason?: string;
  updatedAt: number;
};

export type Settings = {
  apiKey: string;
  mode: Mode;
  workContext: string;
  pins: Pin[];
  allowlist: AllowEntry[];
  thresholds: Thresholds;
};

export type LiveState = {
  settings: Settings;
  hasApiKey: boolean;
  tabs: TabRecord[];
  contextHash: string;
  lastError: string | null;
  judging: boolean;
};

export type GateMessage = {
  type: "STUD_GATE";
  verdict: Verdict | "checking" | "skipped";
  workContext: string;
  host: string;
  reason?: string;
};

export type PopupToBackground =
  | { type: "GET_STATE" }
  | { type: "SET_MODE"; mode: Mode }
  | { type: "SET_CONTEXT"; workContext: string }
  | { type: "SET_API_KEY"; apiKey: string }
  | { type: "PIN_HOST"; host: string; kind: PinKind }
  | { type: "UNPIN_HOST"; host: string }
  | { type: "OVERRIDE_TAB"; tabId: number; verdict: "allow" | "block"; always?: boolean }
  | { type: "OVERRIDE_HERE"; verdict: "allow" | "block"; always?: boolean }
  | { type: "GATE_FOR_ME" }
  | { type: "REMOVE_ALLOW_ENTRY"; key: string }
  | { type: "RESCAN" };

export type BackgroundToPopup = {
  type: "STATE";
  state: LiveState;
};

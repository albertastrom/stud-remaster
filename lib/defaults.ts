import type { Settings, Thresholds } from "./types.ts";

export const THRESHOLDS: Thresholds = {
  relevantAllow: 0.65,
  toolAllow: 0.75,
  toolMaxDistraction: 0.45,
  blockDistraction: 0.72,
  blockMaxRelevant: 0.45,
  noulUncertainLow: 0.4,
  noulUncertainHigh: 0.6,
  leanAllowRelevant: 0.5,
  leanAllowMaxDistraction: 0.5,
  leanBlockDistraction: 0.55,
  leanBlockMaxRelevant: 0.5,
};

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  mode: "free",
  workContext: "",
  pins: [],
  allowlist: [],
};

export const MODEL = "jev-latest";
export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
export const REQUEST_TIMEOUT_MS = 20_000;
export const BATCH_SIZE = 8;
export const SCAN_ALARM = "stud-scan";
export const HOLD_TTL_MS = 2 * 60 * 1000;

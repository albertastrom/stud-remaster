import type { Settings, Thresholds } from "./types.ts";

export const DEFAULT_THRESHOLDS: Thresholds = {
  relevantAllow: 0.65,
  toolAllow: 0.75,
  toolMaxDistraction: 0.45,
  hostBlockDistraction: 0.8,
  hostBlockMaxRelevant: 0.4,
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
  thresholds: DEFAULT_THRESHOLDS,
};

export const MODEL = "jev-latest";
export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
export const BATCH_SIZE = 8;
export const SCAN_ALARM = "stud-scan";
export const HOLD_TTL_MS = 2 * 60 * 1000;

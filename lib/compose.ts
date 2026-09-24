import { THRESHOLDS as t } from "./defaults.ts";
import type { CacheScope, Signals, Verdict } from "./types.ts";

export function composeVerdict({ relevant, distraction, workTool }: Signals): Verdict {
  if (distraction >= t.blockDistraction && relevant < t.blockMaxRelevant) {
    return "block";
  }
  if (relevant >= t.relevantAllow) {
    return "allow";
  }
  if (workTool >= t.toolAllow && distraction < t.toolMaxDistraction) {
    return "allow";
  }

  const uncertain = (n: number) => n > t.noulUncertainLow && n < t.noulUncertainHigh;
  if (uncertain(relevant) && uncertain(distraction)) {
    return "hold";
  }

  if (relevant >= t.leanAllowRelevant && distraction < t.leanAllowMaxDistraction) {
    return "allow";
  }
  if (distraction >= t.leanBlockDistraction && relevant < t.leanBlockMaxRelevant) {
    return "block";
  }
  return "hold";
}

/** Only work tools cache per host; blocks stay per URL so a lecture on a media site can still pass. */
export function cacheScope(signals: Signals, verdict: Verdict): CacheScope {
  return verdict === "allow" && signals.workTool >= t.toolAllow ? "host" : "url";
}

export function verdictReason(verdict: Verdict, signals?: Signals): string {
  if (!signals) {
    if (verdict === "allow") return "You kept this page.";
    if (verdict === "block") return "Off the list.";
    return "Not sure yet.";
  }
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  if (verdict === "allow") {
    return signals.relevant < t.relevantAllow && signals.workTool >= t.toolAllow
      ? `Work tool (${pct(signals.workTool)}).`
      : `Relevant to this work (${pct(signals.relevant)}).`;
  }
  if (verdict === "block") {
    return `Distraction (${pct(signals.distraction)}).`;
  }
  return `Close call: relevant ${pct(signals.relevant)}, distraction ${pct(signals.distraction)}.`;
}

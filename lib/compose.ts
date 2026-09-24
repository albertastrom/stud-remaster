import { THRESHOLDS as t } from "./defaults.ts";
import type { CacheScope, Signals, Verdict } from "./types.ts";
import { isSearchHost } from "./url.ts";

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

/** Work tools cache per host. Blocks and search queries stay on the URL. */
export function cacheScope(signals: Signals, verdict: Verdict, host?: string): CacheScope {
  if (host && isSearchHost(host)) return "url";
  return verdict === "allow" && signals.workTool >= t.toolAllow ? "host" : "url";
}

export function verdictReason(verdict: Verdict, signals?: Signals): string {
  if (!signals) {
    if (verdict === "allow") return "This is okay for the session.";
    if (verdict === "block") return "This is off the list for this work.";
    return "Not sure yet.";
  }
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  if (verdict === "allow") {
    return signals.relevant < t.relevantAllow && signals.workTool >= t.toolAllow
      ? `Looks like a work tool (${pct(signals.workTool)}).`
      : `Looks useful for this work (${pct(signals.relevant)}).`;
  }
  if (verdict === "block") {
    return `Looks like a distraction (${pct(signals.distraction)}).`;
  }
  return `Close call: relevant ${pct(signals.relevant)}, distraction ${pct(signals.distraction)}.`;
}

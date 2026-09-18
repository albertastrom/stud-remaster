import { DEFAULT_THRESHOLDS } from "./defaults.ts";
import type { CacheScope, Signals, Thresholds, Verdict } from "./types.ts";

/** Maps three independent nouls to allow, block, or hold. */
export function composeVerdict(
  signals: Signals,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  const { relevant, distraction, workTool } = signals;
  const t = thresholds;

  if (distraction >= t.blockDistraction && relevant < t.blockMaxRelevant) {
    return "block";
  }
  if (relevant >= t.relevantAllow) {
    return "allow";
  }
  if (workTool >= t.toolAllow && distraction < t.toolMaxDistraction) {
    return "allow";
  }

  const relevantUncertain =
    relevant > t.noulUncertainLow && relevant < t.noulUncertainHigh;
  const distractionUncertain =
    distraction > t.noulUncertainLow && distraction < t.noulUncertainHigh;
  if (relevantUncertain && distractionUncertain) {
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

/** Cache the host when the verdict is about the site, not one page. */
export function cacheScope(
  signals: Signals,
  verdict: Verdict,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): CacheScope {
  if (verdict === "allow" && signals.workTool >= thresholds.toolAllow) {
    return "host";
  }
  if (
    verdict === "block" &&
    signals.distraction >= thresholds.hostBlockDistraction &&
    signals.relevant < thresholds.hostBlockMaxRelevant
  ) {
    return "host";
  }
  return "url";
}

export function verdictReason(verdict: Verdict, signals?: Signals): string {
  if (!signals) {
    if (verdict === "allow") return "On the list.";
    if (verdict === "block") return "Not on the list for this work.";
    return "Not sure yet.";
  }
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  if (verdict === "allow") {
    if (signals.relevant >= DEFAULT_THRESHOLDS.relevantAllow) {
      return `Looks useful for this work (${pct(signals.relevant)} relevant).`;
    }
    return `Treated as a work tool (${pct(signals.workTool)}).`;
  }
  if (verdict === "block") {
    return `Reads as a distraction (${pct(signals.distraction)}), not this work.`;
  }
  return `Close call: relevant ${pct(signals.relevant)}, distraction ${pct(signals.distraction)}.`;
}

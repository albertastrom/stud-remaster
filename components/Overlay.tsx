import { useEffect, useState } from "react";
import type { GateMessage, Verdict } from "../lib/types";

type OverlayState = {
  verdict: Verdict | "checking" | "skipped";
  workContext: string;
  host: string;
  reason?: string;
};

const mascot = browser.runtime.getURL("/mascot.png");

export function Overlay() {
  const [gate, setGate] = useState<OverlayState | null>(null);

  useEffect(() => {
    const onMessage = (message: GateMessage) => {
      if (message?.type !== "STUD_GATE") return;
      setGate((current) => {
        if (
          message.verdict === "checking" &&
          (current?.verdict === "block" || current?.verdict === "hold")
        ) {
          return current;
        }
        return {
          verdict: message.verdict,
          workContext: message.workContext,
          host: message.host,
          reason: message.reason,
        };
      });
    };
    browser.runtime.onMessage.addListener(onMessage);
    void browser.runtime.sendMessage({ type: "GATE_FOR_ME" });
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  if (
    !gate ||
    gate.verdict === "allow" ||
    gate.verdict === "skipped" ||
    gate.verdict === "checking"
  ) {
    return null;
  }

  const hold = gate.verdict === "hold";
  const title = hold ? "not sure this belongs" : "not on the list";
  const body = hold
    ? "Jev could not tell if this tab is for your current work."
    : "This tab is off the list while you study.";

  async function send(verdict: "allow" | "block", always = false) {
    await browser.runtime.sendMessage({
      type: "OVERRIDE_HERE",
      verdict,
      always,
    });
  }

  return (
    <div className="stud-screen">
      <div className="stud-card">
        <img src={mascot} alt="stud" className="stud-mascot" />
        <p className="stud-kicker">stud</p>
        <h1>{title}</h1>
        {gate.workContext ? (
          <p className="stud-context">working on: {gate.workContext}</p>
        ) : null}
        <p className="stud-body">{body}</p>
        {gate.reason ? <p className="stud-reason">{gate.reason}</p> : null}
        <p className="stud-host">{gate.host}</p>
        <div className="stud-actions">
          <button type="button" className="primary" onClick={() => void send("allow")}>
            keep this tab
          </button>
          <button type="button" className="ghost" onClick={() => void send("allow", true)}>
            always allow {gate.host}
          </button>
          {hold ? (
            <button type="button" className="quiet" onClick={() => void send("block", true)}>
              keep it off the list
            </button>
          ) : (
            <button type="button" className="quiet" onClick={() => void send("block")}>
              back to work
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

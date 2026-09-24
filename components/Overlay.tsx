import { useEffect, useState } from "react";
import type { ContentToBackground, GateMessage } from "../lib/types";

const mascot = browser.runtime.getURL("/mascot.png");

function send(message: ContentToBackground) {
  void browser.runtime.sendMessage(message);
}

export function Overlay() {
  const [gate, setGate] = useState<GateMessage | null>(null);

  useEffect(() => {
    const onMessage = (message: GateMessage) => {
      if (message?.type !== "STUD_GATE") return;
      setGate((current) =>
        message.verdict === "checking" &&
        (current?.verdict === "block" || current?.verdict === "hold")
          ? current
          : message,
      );
    };
    browser.runtime.onMessage.addListener(onMessage);
    send({ type: "GATE_FOR_ME" });
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  const gated = gate?.verdict === "block" || gate?.verdict === "hold";

  useEffect(() => {
    if (!gated) return;
    document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((media) => media.pause());
  }, [gated]);

  if (!gated) return null;

  return (
    <div className="stud-screen">
      <div className="stud-card">
        <img src={mascot} alt="" className="stud-mascot" />
        <h1>{gate.verdict === "hold" ? "not sure this fits" : "off the list"}</h1>
        {gate.workContext ? <p className="stud-context">{gate.workContext}</p> : null}
        {gate.reason ? <p className="stud-reason">{gate.reason}</p> : null}
        <div className="stud-actions">
          <button type="button" className="primary" onClick={() => send({ type: "LEAVE" })}>
            back to work
          </button>
          <button type="button" onClick={() => send({ type: "KEEP", always: false })}>
            keep this page
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => send({ type: "KEEP", always: true })}
          >
            always allow {gate.host}
          </button>
        </div>
      </div>
    </div>
  );
}

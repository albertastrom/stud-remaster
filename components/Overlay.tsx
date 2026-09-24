import { useEffect, useState } from "react";
import type { ContentToBackground, GateMessage } from "../lib/types";

const mascot = browser.runtime.getURL("/mascot.png");

function send(message: ContentToBackground) {
  void browser.runtime.sendMessage(message);
}

function pageKey(): string {
  return `${location.origin}${location.pathname}${location.search}`;
}

export function Overlay() {
  const [gate, setGate] = useState<GateMessage | null>(null);

  useEffect(() => {
    const onMessage = (message: GateMessage) => {
      if (message?.type !== "STUD_GATE") return;
      if (message.url !== pageKey()) {
        setGate(null);
        return;
      }
      setGate((current) =>
        message.verdict === "checking" &&
        current?.url === message.url &&
        (current.verdict === "block" || current.verdict === "hold")
          ? current
          : message,
      );
    };
    browser.runtime.onMessage.addListener(onMessage);
    send({ type: "GATE_FOR_ME" });

    const hideIfLeft = () => {
      setGate((current) => (current?.url === pageKey() ? current : null));
    };
    window.addEventListener("popstate", hideIfLeft);
    const nav = (window as Window & { navigation?: EventTarget }).navigation;
    nav?.addEventListener("navigatesuccess", hideIfLeft);

    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      window.removeEventListener("popstate", hideIfLeft);
      nav?.removeEventListener("navigatesuccess", hideIfLeft);
    };
  }, []);

  const gated =
    (gate?.verdict === "block" || gate?.verdict === "hold") && gate.url === pageKey();

  useEffect(() => {
    if (!gated) return;
    document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((media) => media.pause());
  }, [gated]);

  if (!gated || !gate) return null;

  return (
    <div className="stud-screen">
      <div className="stud-card">
        <img src={mascot} alt="" className="stud-mascot" />
        <h1>{gate.verdict === "hold" ? "not sure this helps" : "off the list"}</h1>
        {gate.workContext ? <p className="stud-context">for: {gate.workContext}</p> : null}
        {gate.reason ? <p className="stud-reason">{gate.reason}</p> : null}
        <div className="stud-actions">
          <button type="button" className="primary" onClick={() => send({ type: "LEAVE" })}>
            back to work
          </button>
          <button type="button" onClick={() => send({ type: "KEEP", always: false })}>
            keep it anyway
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

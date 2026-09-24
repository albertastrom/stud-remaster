import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { BackgroundToPopup, LiveState, PopupToBackground, TabVerdict } from "../../lib/types";

const STATUS: Partial<Record<TabVerdict, string>> = {
  allow: "okay",
  block: "off",
  hold: "not sure",
  checking: "looking",
};

export default function App() {
  const [state, setState] = useState<LiveState | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [apiDraft, setApiDraft] = useState("");
  const savedContext = useRef("");

  function apply(next: LiveState | undefined) {
    if (!next) return;
    const prev = savedContext.current;
    const saved = next.settings.workContext;
    savedContext.current = saved;
    setContextDraft((draft) => (draft === prev ? saved : draft));
    setState(next);
  }

  function send(message: PopupToBackground) {
    void browser.runtime.sendMessage(message).then(apply);
  }

  useEffect(() => {
    send({ type: "GET_STATE" });
    const onMessage = (message: BackgroundToPopup) => {
      if (message?.type === "STATE") apply(message.state);
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  if (!state) return null;

  const { settings } = state;
  const study = settings.mode === "study";
  const needsContext = !settings.workContext.trim();
  const canStart = state.hasApiKey && !needsContext;
  const contextDirty = contextDraft.trim() !== settings.workContext;
  const tabs = state.tabs.filter((tab) => tab.verdict !== "skipped");
  const allowPins = settings.pins.filter((pin) => pin.kind === "allow");
  const blockPins = settings.pins.filter((pin) => pin.kind === "block");
  const allowEntries = settings.allowlist.filter(
    (item) => item.contextHash === state.contextHash && item.verdict === "allow",
  );

  function saveContext() {
    if (contextDirty) send({ type: "SET_CONTEXT", workContext: contextDraft });
  }

  function onContextKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      saveContext();
    }
  }

  function saveKey() {
    if (apiDraft.trim()) send({ type: "SET_API_KEY", apiKey: apiDraft });
  }

  return (
    <main className="shell">
      <header className="top">
        <img src="/mascot.png" alt="" width={32} height={32} />
        <h1>stud</h1>
      </header>

      {!state.hasApiKey ? (
        <section className="card">
          <label htmlFor="key">TypeSafe key</label>
          <p className="hint">Needed so stud can check tabs during a session.</p>
          <div className="row">
            <input
              id="key"
              type="password"
              value={apiDraft}
              onChange={(event) => setApiDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && saveKey()}
            />
            <button type="button" className="save" disabled={!apiDraft.trim()} onClick={saveKey}>
              save
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <label htmlFor="context">what are you working on?</label>
        <textarea
          id="context"
          rows={2}
          value={contextDraft}
          placeholder="ENGS 108 problem set 2, Kalman filters"
          onChange={(event) => setContextDraft(event.target.value)}
          onKeyDown={onContextKey}
        />
        {contextDirty ? (
          <div className="row end">
            <button type="button" className="save" onClick={saveContext}>
              save
            </button>
          </div>
        ) : null}
      </section>

      <button
        type="button"
        className={study ? "session end" : "session start"}
        disabled={!study && !canStart}
        onClick={() => send({ type: "SET_MODE", mode: study ? "free" : "study" })}
      >
        {study ? "End session" : "Start session"}
      </button>
      {!study && !state.hasApiKey ? <p className="hint">Add your key before you start.</p> : null}
      {!study && state.hasApiKey && needsContext ? (
        <p className="hint">Say what you are working on, then start.</p>
      ) : null}

      {state.lastError ? <p className="error">{state.lastError}</p> : null}

      <section>
        <div className="section-head">
          <h2>your tabs</h2>
          <button
            type="button"
            className="text"
            disabled={state.judging}
            onClick={() => send({ type: "RESCAN" })}
          >
            {state.judging ? "checking…" : "check again"}
          </button>
        </div>
        <ul className="list">
          {tabs.length === 0 ? <li className="muted">No tabs to show yet.</li> : null}
          {tabs.map((tab) => (
            <li key={tab.tabId} className={tab.verdict}>
              <div className="grow">
                <p className="title">{tab.title}</p>
                <p className="muted">{tab.host}</p>
              </div>
              {tab.verdict === "checking" ? null : (
                <button
                  type="button"
                  className="text"
                  onClick={() =>
                    send({
                      type: "PIN_HOST",
                      host: tab.host,
                      kind: tab.verdict === "allow" ? "block" : "allow",
                    })
                  }
                >
                  always {tab.verdict === "allow" ? "block" : "allow"}
                </button>
              )}
              <span className="pill">{STATUS[tab.verdict]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>okay for this session</h2>
        <ul className="list">
          {allowPins.length === 0 && allowEntries.length === 0 ? (
            <li className="muted">Sites land here once a session is going.</li>
          ) : null}
          {allowPins.map((pin) => (
            <li key={`pin-${pin.host}`}>
              <span className="grow">{pin.host} · always</span>
              <button
                type="button"
                className="text"
                onClick={() => send({ type: "UNPIN_HOST", host: pin.host })}
              >
                forget
              </button>
            </li>
          ))}
          {allowEntries.map((entry) => (
            <li key={entry.key}>
              <span className="grow">{entry.key}</span>
              <button
                type="button"
                className="text"
                onClick={() => send({ type: "REMOVE_ALLOW_ENTRY", key: entry.key })}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      {blockPins.length > 0 ? (
        <section>
          <h2>kept off</h2>
          <ul className="list">
            {blockPins.map((pin) => (
              <li key={pin.host}>
                <span className="grow">{pin.host}</span>
                <button
                  type="button"
                  className="text"
                  onClick={() => send({ type: "UNPIN_HOST", host: pin.host })}
                >
                  forget
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.hasApiKey ? (
        <button
          type="button"
          className="text foot"
          onClick={() => {
            setApiDraft("");
            send({ type: "SET_API_KEY", apiKey: "" });
          }}
        >
          remove key
        </button>
      ) : null}
    </main>
  );
}

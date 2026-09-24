import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { BackgroundToPopup, LiveState, PopupToBackground, TabVerdict } from "../../lib/types";

const STATUS: Partial<Record<TabVerdict, string>> = {
  allow: "allowed",
  block: "blocked",
  hold: "review",
  checking: "checking",
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
        <button
          type="button"
          className={study ? "mode on" : "mode"}
          onClick={() => send({ type: "SET_MODE", mode: study ? "free" : "study" })}
        >
          {study ? "study" : "free"}
        </button>
      </header>

      {!state.hasApiKey ? (
        <section className="card">
          <label htmlFor="key">TypeSafe API key</label>
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
        {study && !settings.workContext ? (
          <p className="hint">Tabs are judged once this is set.</p>
        ) : null}
        {contextDirty ? (
          <div className="row end">
            <button type="button" className="save" onClick={saveContext}>
              set
            </button>
          </div>
        ) : null}
      </section>

      {state.lastError ? <p className="error">{state.lastError}</p> : null}

      {study ? (
        <section>
          <div className="section-head">
            <h2>open tabs</h2>
            <button
              type="button"
              className="text"
              disabled={state.judging}
              onClick={() => send({ type: "RESCAN" })}
            >
              {state.judging ? "checking…" : "rescan"}
            </button>
          </div>
          <ul className="list">
            {tabs.length === 0 ? <li className="muted">No pages to judge.</li> : null}
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
      ) : null}

      <section>
        <h2>allow list</h2>
        <ul className="list">
          {allowPins.length === 0 && allowEntries.length === 0 ? (
            <li className="muted">Nothing yet.</li>
          ) : null}
          {allowPins.map((pin) => (
            <li key={`pin-${pin.host}`}>
              <span className="grow">{pin.host} · pinned</span>
              <button
                type="button"
                className="text"
                onClick={() => send({ type: "UNPIN_HOST", host: pin.host })}
              >
                unpin
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
          <h2>always blocked</h2>
          <ul className="list">
            {blockPins.map((pin) => (
              <li key={pin.host}>
                <span className="grow">{pin.host}</span>
                <button
                  type="button"
                  className="text"
                  onClick={() => send({ type: "UNPIN_HOST", host: pin.host })}
                >
                  unpin
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
          clear API key
        </button>
      ) : null}
    </main>
  );
}

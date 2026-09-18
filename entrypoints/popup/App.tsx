import { useEffect, useMemo, useState } from "react";
import type { BackgroundToPopup, LiveState, PopupToBackground } from "../../lib/types";

const mascot = "/mascot.png";

async function send<T>(message: PopupToBackground): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

function statusLabel(verdict: string) {
  if (verdict === "allow") return "allowed";
  if (verdict === "block") return "blocked";
  if (verdict === "hold") return "review";
  if (verdict === "checking") return "checking";
  return "idle";
}

export default function App() {
  const [state, setState] = useState<LiveState | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [apiDraft, setApiDraft] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    void send<LiveState>({ type: "GET_STATE" }).then((next) => {
      setState(next);
      setContextDraft(next.settings.workContext);
    });
    const onMessage = (message: BackgroundToPopup) => {
      if (message?.type === "STATE") {
        setState(message.state);
        setContextDraft((current) =>
          current === message.state.settings.workContext || current === ""
            ? message.state.settings.workContext
            : current,
        );
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  const settings = state?.settings;
  const study = settings?.mode === "study";
  const needsKey = !state?.hasApiKey;
  const needsContext = !settings?.workContext.trim();

  const list = useMemo(
    () =>
      (state?.tabs ?? []).filter(
        (tab) => tab.verdict !== "skipped" || settings?.mode === "study",
      ),
    [state, settings?.mode],
  );

  const allowEntries = (settings?.allowlist ?? []).filter(
    (item) => item.contextHash === state?.contextHash && item.verdict === "allow",
  );

  if (!state || !settings) {
    return (
      <main className="shell">
        <p className="muted">loading…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="top">
        <img src={mascot} alt="" width={40} height={40} />
        <div>
          <h1>stud</h1>
          <p className="tag">your study buddy</p>
        </div>
        <button
          type="button"
          className={study ? "mode on" : "mode"}
          onClick={() =>
            void send({ type: "SET_MODE", mode: study ? "free" : "study" })
          }
        >
          {study ? "study" : "free"}
        </button>
      </header>

      {needsKey ? (
        <section className="card warn">
          <label htmlFor="key">TypeSafe API key</label>
          <div className="row">
            <input
              id="key"
              type={showKey ? "text" : "password"}
              value={apiDraft}
              placeholder="sk-…"
              onChange={(event) => setApiDraft(event.target.value)}
            />
            <button type="button" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "hide" : "show"}
            </button>
            <button
              type="button"
              className="save"
              onClick={() => void send({ type: "SET_API_KEY", apiKey: apiDraft })}
            >
              save
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <label htmlFor="context">what are you working on?</label>
        <textarea
          id="context"
          rows={3}
          value={contextDraft}
          placeholder="ENGS 108 problem set 2, Kalman filters"
          onChange={(event) => setContextDraft(event.target.value)}
        />
        <div className="row end">
          <button
            type="button"
            className="save"
            disabled={contextDraft.trim() === settings.workContext}
            onClick={() =>
              void send({ type: "SET_CONTEXT", workContext: contextDraft.trim() })
            }
          >
            set context
          </button>
        </div>
        {study && needsContext ? (
          <p className="hint">Study mode waits until you set a context.</p>
        ) : null}
      </section>

      {state.lastError ? <p className="error">{state.lastError}</p> : null}
      {state.judging ? <p className="hint">Jev is updating the allow list…</p> : null}

      <section>
        <div className="section-head">
          <h2>open tabs</h2>
          <button type="button" className="text" onClick={() => void send({ type: "RESCAN" })}>
            rescan
          </button>
        </div>
        <ul className="tabs">
          {list.length === 0 ? (
            <li className="muted">No pages to judge.</li>
          ) : (
            list.map((tab) => (
              <li key={tab.tabId} className={`tab ${tab.verdict}`}>
                <div>
                  <p className="title">{tab.title || tab.host}</p>
                  <p className="host">{tab.host}</p>
                </div>
                <span className="pill">{statusLabel(tab.verdict)}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2>allow list</h2>
        <ul className="list">
          {settings.pins
            .filter((pin) => pin.kind === "allow")
            .map((pin) => (
              <li key={`pin-${pin.host}`}>
                <span>{pin.host} · pinned</span>
                <button
                  type="button"
                  className="text"
                  onClick={() => void send({ type: "UNPIN_HOST", host: pin.host })}
                >
                  unpin
                </button>
              </li>
            ))}
          {allowEntries.map((entry) => (
            <li key={entry.key}>
              <span>
                {entry.scope === "host" ? entry.host : entry.key}
              </span>
              <button
                type="button"
                className="text"
                onClick={() => void send({ type: "REMOVE_ALLOW_ENTRY", key: entry.key })}
              >
                remove
              </button>
            </li>
          ))}
          {settings.pins.filter((p) => p.kind === "allow").length === 0 &&
          allowEntries.length === 0 ? (
            <li className="muted">Empty until Jev allows something.</li>
          ) : null}
        </ul>
      </section>

      {settings.pins.some((pin) => pin.kind === "block") ? (
        <section>
          <h2>always blocked</h2>
          <ul className="list">
            {settings.pins
              .filter((pin) => pin.kind === "block")
              .map((pin) => (
                <li key={pin.host}>
                  <span>{pin.host}</span>
                  <button
                    type="button"
                    className="text"
                    onClick={() => void send({ type: "UNPIN_HOST", host: pin.host })}
                  >
                    unpin
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {!needsKey ? (
        <p className="foot">
          <button
            type="button"
            className="text"
            onClick={() =>
              void send({ type: "SET_API_KEY", apiKey: "" }).then(() => setApiDraft(""))
            }
          >
            clear API key
          </button>
        </p>
      ) : null}
    </main>
  );
}

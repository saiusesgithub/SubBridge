import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, ArrowDown, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Code2, Cpu, FileClock, KeyRound, LayoutDashboard, LoaderCircle, LockKeyhole, Moon, Play, Plus, RefreshCw, Send, Settings2, Shield, Sun, Trash2, X, Zap } from "lucide-react";
import { chooseModel } from "./model-selection";

type ProviderId = "codex" | "claude" | "ollama";
type ProviderState = "ready" | "not-installed" | "auth-required" | "unavailable" | "error" | "unknown";
type ProviderStatus = { id: ProviderId; name: string; state: ProviderState; installed: boolean; supported: boolean; authState: ProviderState; executablePath: string | null; version: string | null; message?: string; capabilities: { completion: boolean; streaming: boolean; models: string[]; auth: string } };
type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number };
type History = { id: string; timestamp: string; provider: ProviderId; model: string; durationMs: number; providerDurationMs?: number; streaming?: boolean; streamingStatus?: string; usage?: Usage; outcome: "success" | "error" | "cancelled"; prompt?: string; response?: string };
type ModelOption = { id: string; display_name: string; provider: ProviderId; available: boolean; capabilities: { completion: boolean; streaming: boolean } };
type ResponseMetrics = { totalDurationMs: number | null; providerDurationMs: number | null; usage: Usage | null; provider: ProviderId; model: string; streaming: "off" | "active" | "completed" | "interrupted" | "final-response-only" | "incremental" };
type Settings = { host: string; port: number; requestTimeoutMs: number; maxBodyBytes: number; maxQueue: number; historyMode: string; ollamaBaseUrl: string; providers: Array<{ id: ProviderId; executablePath: string | null; version: string | null; capabilities: ProviderStatus["capabilities"] }> };
type Page = "Overview" | "Playground" | "History" | "Settings" | "Documentation";

const nav = [
  { name: "Overview" as const, icon: LayoutDashboard, group: "Workspace" },
  { name: "Playground" as const, icon: Code2, group: "Workspace" },
  { name: "History" as const, icon: FileClock, group: "Workspace" },
  { name: "Settings" as const, icon: Settings2, group: "Manage" },
  { name: "Documentation" as const, icon: CircleHelp, group: "Manage" }
];

const integrationSnippet = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8787/v1",
  apiKey: process.env.SUBBRIDGE_TOKEN,
});

const response = await client.chat.completions.create({
  model: "gpt-6-luna", // example; use a model available through your provider
  messages: [{ role: "user", content: "Hello from my app!" }],
});

console.log(response.choices[0].message.content);`;

function StatePill({ state }: { state: ProviderState }) {
  const labels: Record<ProviderState, string> = { ready: "Ready", "not-installed": "Not installed", "auth-required": "Sign in required", unavailable: "Unavailable", error: "Error", unknown: "Checking" };
  return <span className={`state-pill state-${state}`}><i />{labels[state]}</span>;
}

function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [token, setToken] = useState(() => sessionStorage.getItem("subbridge-token") ?? "");
  const [tokenDraft, setTokenDraft] = useState(token);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("subbridge-theme") ?? "dark");
  const [health, setHealth] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("codex");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [manualModel, setManualModel] = useState(false);
  const savedModels = useRef<Partial<Record<ProviderId, string>>>({});
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [requestError, setRequestError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState(true);
  const [responseMetrics, setResponseMetrics] = useState<ResponseMetrics | null>(null);
  const controller = useRef<AbortController | null>(null);
  const selected = providers.find((provider) => provider.id === selectedProvider);
  const available = providers.filter((provider) => provider.supported && provider.state === "ready");

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("subbridge-theme", theme); }, [theme]);

  const request = useCallback(async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
    if (!token) throw new Error("Add your local gateway token to connect.");
    const response = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setModelsLoading(true); setModelsError("");
    request<{ data: ModelOption[] }>(`/v1/models?provider=${selectedProvider}`)
      .then((result) => {
        if (!active) return;
        setModels(result.data);
        const saved = savedModels.current[selectedProvider];
        setModel(chooseModel(result.data, saved ?? ""));
      })
      .catch((error) => { if (active) { setModels([]); setModelsError(error instanceof Error ? error.message : "Model discovery failed."); } })
      .finally(() => { if (active) setModelsLoading(false); });
    return () => { active = false; };
  }, [request, selectedProvider, token]);

  const refresh = useCallback(async () => {
    setLoadingData(true);
    const healthResult = fetch("/health").then((response) => setHealth(response.ok)).catch(() => setHealth(false));
    if (token) {
      try {
        const [providerData, configData, historyData] = await Promise.all([
          request<{ data: ProviderStatus[] }>("/v1/providers"),
          request<Settings>("/v1/config"),
          request<{ data: History[] }>("/v1/history")
        ]);
        setProviders(providerData.data); setSettings(configData); setHistory(historyData.data);
        if (!providerData.data.some((item) => item.id === selectedProvider && item.state === "ready")) {
          const ready = providerData.data.find((item) => item.supported && item.state === "ready");
          if (ready) setSelectedProvider(ready.id);
        }
        setNotice("");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to connect to SubBridge."); }
    } else { setProviders([]); setHistory([]); setSettings(null); }
    await healthResult;
    setLoadingData(false);
  }, [request, selectedProvider, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const useToken = (event: React.FormEvent) => {
    event.preventDefault();
    const next = tokenDraft.trim();
    sessionStorage.setItem("subbridge-token", next);
    setToken(next); setNotice("");
  };

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || !model.trim()) { setRequestError("Choose an available model or enter a model ID in advanced mode, then add a message."); return; }
    setBusy(true); setAnswer(""); setRequestError(""); setResponseMetrics({ totalDurationMs: null, providerDurationMs: null, usage: null, provider: selectedProvider, model: model.trim(), streaming: stream ? "active" : "off" });
    const aborter = new AbortController(); controller.current = aborter;
    try {
      const body = JSON.stringify({ provider: selectedProvider, model: model.trim(), messages: [{ role: "user", content: prompt.trim() }], stream });
      const response = await fetch("/v1/chat/completions", { method: "POST", signal: aborter.signal, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: stream ? "text/event-stream" : "application/json" }, body });
      if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(payload.error?.message ?? `Request failed (${response.status})`); }
      if (stream && response.body) {
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ""; let receivedDone = false;
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          let split = pending.indexOf("\n\n");
          while (split >= 0) {
            const frame = pending.slice(0, split); pending = pending.slice(split + 2);
            const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
            if (data === "[DONE]") receivedDone = true;
            if (data && data !== "[DONE]") {
              const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; error?: { message?: string }; subbridge_metrics?: { totalDurationMs: number; providerDurationMs: number | null; usage: Usage | null; provider: ProviderId; model: string; streaming: "final-response-only" | "incremental" } };
              if (payload.error) throw new Error(payload.error.message ?? "Provider request failed.");
              if (payload.subbridge_metrics) { const metrics = payload.subbridge_metrics; setResponseMetrics({ totalDurationMs: metrics.totalDurationMs, providerDurationMs: metrics.providerDurationMs, usage: metrics.usage, provider: metrics.provider, model: metrics.model, streaming: metrics.streaming }); }
              const text = payload.choices?.[0]?.delta?.content;
              if (text) setAnswer((current) => current + text);
            }
            split = pending.indexOf("\n\n");
          }
          if (done) break;
        }
        if (!receivedDone) throw new Error("Streaming connection ended before completion.");
      } else {
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: Usage };
        setAnswer(payload.choices?.[0]?.message?.content ?? "");
        const totalDurationMs = Number(response.headers.get("x-subbridge-request-duration-ms"));
        const providerDurationMs = Number(response.headers.get("x-subbridge-provider-duration-ms"));
        setResponseMetrics({ totalDurationMs: Number.isFinite(totalDurationMs) && totalDurationMs >= 0 ? totalDurationMs : null, providerDurationMs: Number.isFinite(providerDurationMs) && providerDurationMs >= 0 ? providerDurationMs : null, usage: payload.usage ?? null, provider: selectedProvider, model: model.trim(), streaming: "off" });
      }
      await refresh();
    } catch (error) {
      if (aborter.signal.aborted) { setRequestError("Request cancelled."); setResponseMetrics((current) => current ? { ...current, streaming: "interrupted" } : current); }
      else { setRequestError(error instanceof Error ? error.message : "Provider request failed."); if (stream) setResponseMetrics((current) => current ? { ...current, streaming: "interrupted" } : current); }
    } finally { setBusy(false); setResponseMetrics((current) => current?.streaming === "active" ? { ...current, streaming: "completed" } : current); controller.current = null; }
  };

  const clearHistory = async () => {
    if (!window.confirm("Clear all locally stored request history?")) return;
    try { await request<void>("/v1/history", { method: "DELETE" }); setHistory([]); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to clear history."); }
  };

  const removeHistory = async (id: string) => {
    try { await request<void>(`/v1/history/${encodeURIComponent(id)}`, { method: "DELETE" }); setHistory((items) => items.filter((item) => item.id !== id)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to remove history item."); }
  };

  const timeLabel = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()), []);
  const successCount = history.filter((item) => item.outcome === "success").length;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span /><span /><span /></div><div><strong>subbridge</strong><small>LOCAL AI GATEWAY</small></div></div>
      <div className="workspace-select"><div className="workspace-avatar">S</div><div><b>My workspace</b><small>Local instance</small></div><ChevronDown size={15} /></div>
      <div className="nav-group-label">WORKSPACE</div>
      <nav>{nav.slice(0, 3).map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => setPage(name)}><Icon size={17} strokeWidth={1.8} /><span>{name}</span>{name === "History" && history.length > 0 && <em>{history.length}</em>}</button>)}</nav>
      <div className="nav-group-label manage-label">MANAGE</div>
      <nav>{nav.slice(3).map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => setPage(name)}><Icon size={17} strokeWidth={1.8} /><span>{name}</span></button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-secure"><div className="secure-icon"><Shield size={16} /></div><div><b>Private by default</b><small>Requests stay on this device</small></div><Check size={14} /></div>
        <div className="user-card"><div className="user-avatar">SB</div><div><b>Local instance</b><small>127.0.0.1:{settings?.port ?? 8787}</small></div><button aria-label="Settings" onClick={() => setPage("Settings")}><Settings2 size={16} /></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><span>SubBridge</span><i>/</i><b>{page}</b></div>
        <div className="top-actions"><span className="live-dot"><i /> {health ? "Gateway online" : "Gateway offline"}</span><span className="top-divider" /><span className="time-label">{timeLabel}</span><button className="icon-button" aria-label="Refresh status" onClick={() => void refresh()} disabled={loadingData}><RefreshCw size={16} className={loadingData ? "spin" : ""} /></button><button className="icon-button theme-toggle" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><div className="top-avatar">SB</div></div>
      </header>

      <div className="content-wrap">
        {notice && <div className="notice"><AlertCircle size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
        {!token && <section className="connect-banner"><div className="connect-icon"><KeyRound size={19} /></div><div><b>Connect to your local gateway</b><p>Paste the token printed by <code>npm run start</code> or generated by the setup wizard. It stays in this browser tab only.</p></div><form onSubmit={useToken}><input type={tokenVisible ? "text" : "password"} value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="Local gateway token" aria-label="Local gateway token" /><button className="button button-primary" type="submit">Connect <ArrowRight size={15} /></button></form><button className="token-eye" onClick={() => setTokenVisible((show) => !show)}>{tokenVisible ? "Hide" : "Show"}</button></section>}

        {page === "Overview" && <>
          <section className="hero-row"><div><div className="eyebrow"><span className="eyebrow-line" /> LOCAL-FIRST AI ROUTING</div><h1>Your AI, <span>on your terms.</span></h1><p className="hero-copy">One private gateway. Your existing tools. Nothing leaves your machine unless you choose a provider.</p><div className="hero-buttons"><button className="button button-primary" onClick={() => setPage("Playground")}><Play size={15} fill="currentColor" /> Open playground</button><button className="button button-secondary" onClick={() => setPage("Settings")}><Settings2 size={15} /> Configure gateway</button></div></div><div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="art-core"><div className="brand-mark"><span /><span /><span /></div></div><span className="orbit-node node-a"><Cpu size={14} /></span><span className="orbit-node node-b"><LockKeyhole size={13} /></span><span className="orbit-node node-c"><Zap size={13} /></span></div></section>
          <section className="metric-grid"><div className="metric-card"><div className="metric-top"><span>GATEWAY STATUS</span><Activity size={15} /></div><strong className="metric-value"><i className={health ? "metric-good" : "metric-muted"} />{health ? "Operational" : "Offline"}</strong><small>{health ? "Loopback only · Token protected" : "Start the local SubBridge server"}</small></div><div className="metric-card"><div className="metric-top"><span>ACTIVE PROVIDERS</span><Cpu size={15} /></div><strong className="metric-value">{available.length}<small> / 2</small></strong><small>{providers.filter((item) => item.installed).map((item) => item.name).join(" · ") || "No supported providers ready"}</small></div><div className="metric-card"><div className="metric-top"><span>REQUESTS TODAY</span><FileClock size={15} /></div><strong className="metric-value">{history.filter((item) => new Date(item.timestamp).toDateString() === new Date().toDateString()).length}</strong><small>{successCount} successful · local history</small></div><div className="metric-card"><div className="metric-top"><span>DATA RETENTION</span><Shield size={15} /></div><strong className="metric-value">{settings?.historyMode === "full" ? "Full" : "Metadata"}</strong><small>{settings?.historyMode === "full" ? "Prompt and answer stored locally" : "No prompts or answers saved"}</small></div></section>
          <section className="section-heading"><div><h2>Provider connections</h2><p>Discovered locally. Nothing is enabled unless its adapter is supported.</p></div><button className="text-button" onClick={() => void refresh()}><RefreshCw size={14} /> Refresh</button></section>
          <section className="provider-grid">{providers.map((provider) => <ProviderCard key={provider.id} provider={provider} onOpen={() => { setSelectedProvider(provider.id); setPage("Playground"); }} />)}{providers.length === 0 && <div className="empty-card">{token ? <><LoaderCircle className="spin" size={18} /> Discovering providers…</> : <>Connect with your gateway token to inspect installed providers.</>}</div>}</section>
          <section className="lower-grid"><div className="panel recent-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Your latest local requests</p></div><button className="text-button" onClick={() => setPage("History")}>View history <ArrowRight size={14} /></button></div>{history.length ? <div className="recent-list">{history.slice(0, 4).map((item) => <HistoryRow key={item.id} item={item} onDelete={removeHistory} />)}</div> : <div className="empty-state"><div className="empty-orbit"><FileClock size={17} /></div><b>No requests yet</b><span>Your activity will appear here after your first run.</span></div>}</div><div className="panel quick-panel"><div className="panel-heading"><div><h3>Quick start</h3><p>Three steps to your first response</p></div><span className="quick-icon"><Zap size={15} /></span></div><div className="quick-step"><span>01</span><div><b>Connect your gateway</b><small>Use the local token from your terminal.</small></div><CheckCircle2 size={16} className={token ? "step-done" : ""} /></div><div className="quick-step"><span>02</span><div><b>Check a provider</b><small>Install Codex CLI or run local Ollama.</small></div><ArrowRight size={15} /></div><div className="quick-step"><span>03</span><div><b>Send a message</b><small>Try the playground with a local model.</small></div><button className="step-go" onClick={() => setPage("Playground")}><ArrowDown size={14} /></button></div></div></section>
        </>}

        {page === "Playground" && <section className="page-section"><div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> EXPERIMENT</div><h1>Playground</h1><p>Try a provider through your authenticated local gateway.</p></div><div className="privacy-tag"><LockKeyhole size={14} /> Local endpoint</div></div><div className="playground-grid"><form className="panel playground-form" onSubmit={run}><div className="panel-heading"><div><h3>New request</h3><p>Plain chat completion · no tools enabled</p></div><span className="form-step"><Plus size={14} /> Request</span></div><label className="field-label">PROVIDER<span>Only verified adapters can run</span></label><div className="provider-choice">{providers.map((provider) => <button key={provider.id} type="button" className={`provider-option ${selectedProvider === provider.id ? "chosen" : ""}`} disabled={!provider.supported || provider.state !== "ready"} onClick={() => { savedModels.current[selectedProvider] = model; setSelectedProvider(provider.id); setModel(savedModels.current[provider.id] ?? ""); }}><ProviderGlyph id={provider.id} /><span><b>{provider.name}</b><small>{provider.state === "ready" ? "Available" : provider.state === "auth-required" ? "Sign in required" : provider.supported ? "Unavailable" : "Adapter not implemented"}</small></span>{provider.state === "ready" && <i />}</button>)}</div><label className="field-label" htmlFor="model-select">MODEL <span>{modelsLoading ? "Discovering models…" : models.length ? `${models.length} advertised by ${selectedProvider}` : "No verified model catalog"}</span></label>{models.length ? <ModelPicker models={models.filter((item) => item.available)} value={model} onSelect={(value) => { setModel(value); savedModels.current[selectedProvider] = value; }} /> : <><div className="model-empty">{modelsLoading ? "Checking provider model catalog…" : modelsError ? modelsError : selectedProvider === "codex" ? "Codex CLI does not expose a documented model-list command. Use a model ID supported by your account." : "The provider did not advertise any available models."}</div><button type="button" className="text-button" onClick={() => setManualModel((value) => !value)}>{manualModel ? "Hide manual model ID" : "Advanced: enter model ID"}</button>{manualModel && <input id="model-select" className="field-input" value={model} onChange={(event) => { setModel(event.target.value); savedModels.current[selectedProvider] = event.target.value; }} placeholder="Provider-supported model ID" autoComplete="off" />}</>}
          <label className="field-label" htmlFor="prompt">MESSAGE</label><textarea id="prompt" className="prompt-input" rows={7} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask a question or try a prompt…" maxLength={100000} /><div className="composer-bottom"><span>{prompt.length.toLocaleString()} / 100,000</span><label className="toggle-label"><input type="checkbox" checked={stream} onChange={(event) => setStream(event.target.checked)} /> Stream response</label></div>{requestError && <div className="inline-error"><AlertCircle size={15} />{requestError}</div>}<div className="submit-row"><span><Shield size={14} /> Your prompt is sent only to the selected provider.</span>{busy ? <button type="button" className="button button-danger" onClick={() => controller.current?.abort()}><X size={15} /> Cancel</button> : <button className="button button-primary" type="submit" disabled={!token || !selected || selected.state !== "ready"}><Send size={14} /> Run request</button>}</div></form><div className="panel response-panel"><div className="panel-heading"><div><h3>Response</h3><p>{busy ? <span className="responding"><i /> Provider is responding</span> : answer ? "Completed" : "Waiting for a request"}</p></div>{busy && <LoaderCircle size={16} className="spin response-loader" />}{answer && !busy && <span className="response-badge"><Check size={12} /> Done</span>}</div>{requestError && !answer ? <div className="response-empty response-error"><AlertCircle size={20} /><b>Request didn’t complete</b><span>{requestError}</span></div> : answer ? <pre className="answer-content">{answer}{busy && <i className="caret" />}</pre> : <div className="response-empty"><div className="response-placeholder"><span /><span /><span /></div><b>Your response will appear here</b><span>Select a provider and model, then run a request.</span></div>}{responseMetrics && <div className="response-metrics"><Metric label="Response" value={responseMetrics.totalDurationMs === null ? "—" : `${(responseMetrics.totalDurationMs / 1000).toFixed(2)} s`} /><Metric label="Provider" value={responseMetrics.providerDurationMs === null ? "—" : `${(responseMetrics.providerDurationMs / 1000).toFixed(2)} s`} /><Metric label="Input tokens" value={responseMetrics.usage?.prompt_tokens === undefined ? "Not reported" : String(responseMetrics.usage.prompt_tokens)} /><Metric label="Output tokens" value={responseMetrics.usage?.completion_tokens === undefined ? "Not reported" : String(responseMetrics.usage.completion_tokens)} /><Metric label="Total tokens" value={responseMetrics.usage?.total_tokens === undefined ? "Not reported" : String(responseMetrics.usage.total_tokens)} /><Metric label="Stream" value={responseMetrics.streaming === "off" ? "Off" : responseMetrics.streaming === "active" ? "Active" : responseMetrics.streaming === "interrupted" ? "Interrupted" : responseMetrics.streaming === "final-response-only" ? "Completed · final response only" : "Completed · incremental"} /><Metric label="Provider / model" value={`${responseMetrics.provider} · ${responseMetrics.model}`} /></div>}<div className="response-footer"><span><span className="footer-led" /> SUBBRIDGE LOCAL</span><span>OpenAI-shaped subset</span></div></div></div></section>}

        {page === "Documentation" && <section className="page-section"><div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> BUILD WITH SUBBRIDGE</div><h1>Documentation</h1><p>Connect your own app to this local gateway. The model below is an example; choose one advertised by your configured provider.</p></div></div><div className="panel docs-panel"><div className="panel-heading"><div><h3>OpenAI SDK quick start</h3><p>Base URL and gateway token are the only SubBridge-specific settings.</p></div><button className="button button-secondary" onClick={() => void navigator.clipboard.writeText(integrationSnippet).then(() => setNotice("Integration snippet copied."))}><Code2 size={14} /> Copy snippet</button></div><pre className="docs-snippet">{integrationSnippet}</pre><div className="docs-links"><a href="/getting-started.md" target="_blank" rel="noreferrer">Getting started <ArrowRight size={13} /></a><a href="/integrations.md" target="_blank" rel="noreferrer">Integration examples <ArrowRight size={13} /></a><a href="/deployment-security.md" target="_blank" rel="noreferrer">Deployment &amp; security <ArrowRight size={13} /></a><a href="/api-reference.md" target="_blank" rel="noreferrer">API reference &amp; troubleshooting <ArrowRight size={13} /></a></div></div></section>}\n\n        {page === "History" && <section className="page-section"><div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> LOCAL RECORDS</div><h1>Request history</h1><p>Stored on this machine. {settings?.historyMode === "full" ? "Responses are saved." : "Prompt and response bodies are not saved."}</p></div><button className="button button-secondary" onClick={() => void clearHistory()} disabled={!history.length}><Trash2 size={15} /> Clear history</button></div><div className="panel history-panel"><div className="history-head"><span>REQUEST</span><span>PROVIDER</span><span>MODEL</span><span>DURATION</span><span>OUTCOME</span><span /></div>{history.length ? history.map((item) => <HistoryRow key={item.id} item={item} onDelete={removeHistory} expanded />) : <div className="empty-state history-empty"><div className="empty-orbit"><FileClock size={17} /></div><b>Nothing here yet</b><span>Requests appear here as soon as you use the playground.</span></div>}</div></section>}

        {page === "Settings" && <section className="page-section"><div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" /> LOCAL CONFIGURATION</div><h1>Settings</h1><p>Current server configuration and verified provider details.</p></div><button className="button button-secondary" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button></div><div className="settings-layout"><div className="panel settings-panel"><div className="panel-heading"><div><h3>Gateway</h3><p>Read from the running local process</p></div><span className="settings-icon"><Settings2 size={16} /></span></div><SettingRow label="Listener" value={`${settings?.host ?? "127.0.0.1"}:${settings?.port ?? "—"}`} hint="Loopback interface" /><SettingRow label="Request timeout" value={settings ? `${Math.round(settings.requestTimeoutMs / 1000)} seconds` : "—"} hint="SUBBRIDGE_REQUEST_TIMEOUT_MS" /><SettingRow label="Max request body" value={settings ? `${(settings.maxBodyBytes / 1024 / 1024).toFixed(1)} MB` : "—"} hint="SUBBRIDGE_MAX_BODY_BYTES" /><SettingRow label="Maximum queue" value={settings ? `${settings.maxQueue} waiting requests` : "—"} hint="SUBBRIDGE_MAX_QUEUE" /><SettingRow label="History mode" value={settings?.historyMode === "full" ? "Full response history" : "Metadata only"} hint={settings?.historyMode === "full" ? "Prompts and responses stored locally" : "Bodies are omitted from disk"} /><SettingRow label="Ollama API" value={settings?.ollamaBaseUrl ?? "—"} hint="Localhost-only URL" /></div><div className="panel settings-panel"><div className="panel-heading"><div><h3>Provider capabilities</h3><p>Detected executable and supported actions</p></div><span className="settings-icon"><Cpu size={16} /></span></div>{providers.map((provider) => <div className="capability-block" key={provider.id}><div className="capability-title"><ProviderGlyph id={provider.id} /><b>{provider.name}</b><StatePill state={provider.state} /></div><SettingRow label="Executable" value={provider.executablePath ?? "Not detected"} mono /><SettingRow label="Version" value={provider.version ?? "Not verified"} /><div className="cap-chips"><span className={provider.capabilities.completion ? "chip-on" : ""}>Completion {provider.capabilities.completion ? "· on" : "· off"}</span><span className={provider.capabilities.streaming ? "chip-on" : ""}>Streaming {provider.capabilities.streaming ? "· on" : "· off"}</span><span>{provider.capabilities.models.length ? `${provider.capabilities.models.length} live models` : "No verified model list"}</span></div>{provider.message && <p className="provider-note">{provider.message}</p>}</div>)}{providers.length === 0 && <p className="settings-empty">Connect with your token to inspect actual provider status.</p>}</div><div className="panel settings-panel token-settings"><div className="panel-heading"><div><h3>Dashboard session</h3><p>Token is held in tab session storage</p></div><span className="settings-icon"><KeyRound size={16} /></span></div><form className="token-form" onSubmit={useToken}><input className="field-input" type="password" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="Paste local gateway token"/><button className="button button-primary" type="submit">{token ? "Update token" : "Connect"}</button></form>{token && <button className="text-button disconnect" onClick={() => { sessionStorage.removeItem("subbridge-token"); setToken(""); setTokenDraft(""); }}><LockKeyhole size={14} /> Disconnect this tab</button>}</div></div></section>}
        <footer className="app-footer"><span><span className="footer-led" /> Bound to loopback</span><span>SubBridge v2 · local-first, by design</span><button className="footer-doc-link" onClick={() => setPage("Documentation")}>Documentation <ArrowRight size={12} /></button></footer>
      </div>
    </main>
  </div>;
}

function ProviderCard({ provider, onOpen }: { provider: ProviderStatus; onOpen: () => void }) {
  return <article className="provider-card"><div className="provider-card-head"><ProviderGlyph id={provider.id} /><StatePill state={provider.state} /><button className="more-button" aria-label={`Open ${provider.name}`} onClick={onOpen}><ArrowRight size={15} /></button></div><h3>{provider.name}</h3><p>{provider.message ?? (provider.supported ? "Checking local installation and authentication…" : "Detected only; provider adapter is not implemented.")}</p><div className="provider-card-meta"><span>{provider.version ?? (provider.installed ? "Version unavailable" : "No executable detected")}</span><b>{provider.capabilities.models.length ? `${provider.capabilities.models.length} models` : "No model catalog"}</b></div><div className="provider-card-foot"><div><span className={provider.capabilities.completion ? "cap-dot active" : "cap-dot"} /> Chat completion</div><div><span className={provider.capabilities.streaming ? "cap-dot active" : "cap-dot"} /> Streaming</div></div></article>;
}

function ModelPicker({ models, value, onSelect }: { models: ModelOption[]; value: string; onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = models.find((item) => item.id === value);
  useEffect(() => { setQuery(selected?.display_name ?? value); }, [selected?.display_name, value]);
  const matches = models.filter((item) => `${item.display_name} ${item.id}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="model-picker">
    <input id="model-select" className="field-input" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="model-options" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && matches[0]) { event.preventDefault(); onSelect(matches[0].id); setOpen(false); } }} placeholder="Search available models…" autoComplete="off" onBlur={() => setOpen(false)} />
    {open && <div id="model-options" className="model-options" role="listbox">{matches.length ? matches.map((item) => <button type="button" key={item.id} role="option" aria-selected={item.id === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(item.id); setQuery(item.display_name); setOpen(false); }}><b>{item.display_name}</b><small>{item.id}</small></button>) : <div className="model-option-empty">No matching available model</div>}</div>}
  </div>;
}

function ProviderGlyph({ id }: { id: ProviderId }) {
  return <span className={`provider-glyph glyph-${id}`}>{id === "codex" ? <Code2 size={17} /> : id === "ollama" ? <Cpu size={17} /> : <CircleHelp size={17} />}</span>;
}

function HistoryRow({ item, onDelete, expanded = false }: { item: History; onDelete: (id: string) => void; expanded?: boolean }) {
  return <div className={`history-row ${expanded ? "expanded" : ""}`}><div className="history-request"><span className={`outcome-mark outcome-${item.outcome}`}>{item.outcome === "success" ? <Check size={12} /> : <AlertCircle size={12} />}</span><div><b>{new Date(item.timestamp).toLocaleString()}</b>{item.response ? <small title={item.response}>{item.response.slice(0, 100)}{item.response.length > 100 ? "…" : ""}</small> : item.prompt ? <small title={item.prompt}>Prompt: {item.prompt.slice(0, 85)}{item.prompt.length > 85 ? "…" : ""} · response saved</small> : <small>{item.outcome === "success" ? "Prompt and response not stored (metadata mode)" : "Request did not complete"}</small>}</div></div><div className="history-provider"><ProviderGlyph id={item.provider} /><span>{item.provider}</span></div><span className="history-model">{item.model}</span><span className="history-duration"><Clock3 size={13} /> {item.durationMs < 1000 ? `${item.durationMs} ms` : `${(item.durationMs / 1000).toFixed(1)} s`}{(item.providerDurationMs !== undefined || item.usage || item.streaming) && <small>{item.providerDurationMs !== undefined ? `${(item.providerDurationMs / 1000).toFixed(2)} s provider · ` : ""}{item.usage ? `${item.usage.prompt_tokens ?? item.usage.promptTokens ?? "—"} in · ${item.usage.completion_tokens ?? item.usage.completionTokens ?? "—"} out` : item.streaming ? "Streaming request" : ""}</small>}</span><span className={`outcome-label outcome-text-${item.outcome}`}>{item.outcome}</span><button className="icon-button delete-history" aria-label="Delete history entry" onClick={() => onDelete(item.id)}><Trash2 size={14} /></button></div>;
}

function SettingRow({ label, value, hint, mono = false }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return <div className="setting-row"><div><b>{label}</b>{hint && <small>{hint}</small>}</div><span className={mono ? "mono-value" : ""} title={value}>{value}</span></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="response-metric"><span>{label}</span><b title={value}>{value}</b></div>;
}

export default App;

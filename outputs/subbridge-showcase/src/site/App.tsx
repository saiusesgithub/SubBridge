import { useMemo, useState, type ReactNode } from "react";
import {
  Activity, ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Code2, Command,
  Cpu, FileClock, Github, Globe2, Layers3, LockKeyhole, Menu, MessageSquare,
  Play, Radio, Route, ShieldCheck, Sparkles, Terminal, X, Zap,
} from "lucide-react";

type Provider = "Codex CLI" | "Ollama";
type SampleRequest = { time: string; provider: Provider; model: string; duration: string; outcome: "Success" | "Ready" };
const models: Record<Provider, string[]> = {
  "Codex CLI": ["gpt-6-luna · example", "gpt-6-sol · example"],
  Ollama: ["llama3.2 · example", "qwen2.5 · example"],
};
const sampleResponses: Record<Provider, string> = {
  "Codex CLI": "A local gateway can give your project one stable HTTP interface while leaving provider login with the CLI you already use. In a real setup, availability and usage follow your account and the provider's current policies.",
  Ollama: "Ollama serves local models through its local HTTP API. SubBridge can discover installed model names and pass supported text completion requests through the local provider adapter.",
};

const initialHistory: SampleRequest[] = [
  { time: "10:42:18 AM", provider: "Codex CLI", model: "gpt-6-luna", duration: "2.41 s", outcome: "Success" },
  { time: "10:38:05 AM", provider: "Ollama", model: "llama3.2", duration: "0.84 s", outcome: "Success" },
];

const features = [
  { icon: Route, title: "Unified AI gateway", desc: "A small authenticated Chat Completions interface for the provider adapters SubBridge actually supports." },
  { icon: ShieldCheck, title: "Local-first by design", desc: "Loopback binding, a local gateway token and provider-owned authentication. Cloud providers may still receive prompts." },
  { icon: Activity, title: "Provider discovery", desc: "Detect supported local CLIs and Ollama. Claude Code detection is informational; its adapter is not implemented." },
  { icon: Code2, title: "OpenAI SDK integration", desc: "Use the official SDK for the supported text Chat Completions subset by changing base URL and gateway token." },
  { icon: Layers3, title: "Developer dashboard", desc: "Inspect provider status, select or save model IDs, try prompts and review local request history." },
  { icon: Radio, title: "Streaming support", desc: "Ollama can emit incremental text. Codex currently returns one final response chunk over SSE." },
  { icon: Activity, title: "Response metrics", desc: "Show elapsed/provider time and usage only when reported by the provider adapter." },
  { icon: BookOpen, title: "Practical documentation", desc: "Examples and limitations for JavaScript, Python, Next.js, FastAPI, curl and local networking." },
  { icon: Command, title: "Cross-platform CLI detection", desc: "Native executable discovery for Windows, macOS and Linux, with bounded version checks." },
];

export default function App() {
  const [provider, setProvider] = useState<Provider>("Codex CLI");
  const [model, setModel] = useState(models["Codex CLI"][0]!);
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [history, setHistory] = useState(initialHistory);
  const [running, setRunning] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [docsOpen, setDocsOpen] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("http://127.0.0.1:8787");

  const githubUrl = import.meta.env.VITE_GITHUB_URL;
  const videoUrl = import.meta.env.VITE_DEMO_VIDEO_URL;
  const docsUrl = import.meta.env.VITE_DOCS_URL;
  const code = useMemo(() => `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "http://127.0.0.1:8787/v1",\n  apiKey: process.env.SUBBRIDGE_TOKEN,\n});\n\nconst result = await client.chat.completions.create({\n  model: "gpt-6-luna", // example; use a model supported by your provider\n  messages: [{ role: "user", content: "Hello from my app!" }],\n});\n\nconsole.log(result.choices[0].message.content);`, []);

  const selectProvider = (next: Provider) => {
    setProvider(next);
    setModel(models[next][0]!);
    setResponse("");
  };

  const sendDemo = () => {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setResponse("");
    // This is intentionally a local sample response. No backend or AI endpoint is called.
    window.setTimeout(() => {
      setResponse(sampleResponses[provider]);
      setHistory((items) => [{ time: new Date().toLocaleTimeString(), provider, model: model.split(" ·")[0]!, duration: provider === "Codex CLI" ? "2.41 s" : "0.84 s", outcome: "Success" as const }, ...items].slice(0, 4));
      setRunning(false);
    }, 650);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return <div className="site-shell">
    <header className="top-nav">
      <a className="wordmark" href="#top" aria-label="SubBridge home"><span className="mark"><i /><i /><i /></span><span>subbridge</span></a>
      <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X /> : <Menu />}</button>
      <nav className={mobileNav ? "nav-links open" : "nav-links"}>
        <a href="#how">How it works</a><a href="#features">Features</a><a href="#playground">Demo</a><a href="#docs">Docs</a>
        {githubUrl ? <a className="nav-source" href={githubUrl} target="_blank" rel="noreferrer"><Github size={15} /> Source <ArrowUpRight size={13} /></a> : <span className="nav-source muted"><Github size={15} /> Source soon</span>}
      </nav>
    </header>

    <main id="top">
      <section className="hero section-wrap">
        <div className="hero-copy">
          <div className="status-kicker"><span className="pulse-dot" /> SELF-HOSTED · OPEN SOURCE · DEVELOPER TOOL</div>
          <h1 className="text-balance">Your AI tools.<br /><span>One local API.</span></h1>
          <p className="hero-lead">An open-source, self-hosted gateway that connects supported AI CLI tools and local models to personal projects through a unified HTTP interface.</p>
          <div className="hero-actions"><a className="button button-primary" href="#playground"><Play size={15} fill="currentColor" /> Explore demo <ArrowDownRight size={15} /></a><a className="button button-quiet" href="#docs"><BookOpen size={16} /> View documentation</a></div>
          <div className="hero-caption"><LockKeyhole size={14} /> Binds to loopback by default <span /> Provider policies still apply</div>
        </div>
        <div className="hero-visual" aria-label="Illustration of a local gateway routing requests to provider adapters">
          <div className="visual-glow" /><div className="visual-grid" />
          <div className="flow-card app-card"><span className="app-icon"><Code2 size={17} /></span><div><small>YOUR PROJECT</small><b>OpenAI SDK</b></div><span className="flow-live">REQUEST</span></div>
          <div className="flow-line line-one"><i /></div>
          <div className="gateway-card"><div className="gateway-top"><span className="brand-mini"><i /><i /><i /></span><span>SUBBRIDGE GATEWAY</span><span className="gateway-lock"><LockKeyhole size={13} /></span></div><div className="gateway-main"><div className="gateway-ring"><span><Route size={24} /></span></div><div><b>One local endpoint</b><small>127.0.0.1:8787/v1</small></div></div><div className="gateway-foot"><span><i /> TOKEN PROTECTED</span><span>CHAT COMPLETIONS</span></div></div>
          <div className="flow-line line-two"><i /></div>
          <div className="provider-nodes"><div className="provider-node"><span className="codex-glyph"><Terminal size={16} /></span><div><small>CLI ADAPTER</small><b>Codex CLI</b></div><span className="node-status">SUPPORTED</span></div><div className="provider-node"><span className="ollama-glyph"><Cpu size={16} /></span><div><small>LOCAL HTTP</small><b>Ollama</b></div><span className="node-status node-planned">ADAPTER</span></div></div>
          <div className="visual-note"><Sparkles size={13} /> Route through tools you already use</div>
        </div>
        <div className="hero-bottom"><span>BUILT FOR PERSONAL AI PROJECTS</span><div><span>Node.js</span><b>·</b><span>Fastify</span><b>·</b><span>React</span><b>·</b><span>TypeScript</span></div><a href="#how">See the architecture <ArrowDown size={14} /></a></div>
      </section>

      <section className="trust-strip"><div className="section-wrap trust-inner"><span><ShieldCheck size={16} /> Local gateway, local token</span><span><Cpu size={16} /> Provider-owned sign-in</span><span><Globe2 size={16} /> OpenAI-shaped subset</span><span><Activity size={16} /> No telemetry</span></div></section>

      <section id="playground" className="demo-section section-wrap">
        <div className="section-heading"><div><div className="eyebrow">PRODUCT PREVIEW <span className="sample-chip"><i /> SIMULATED DATA</span></div><h2>Take a look around.</h2><p>Explore the developer dashboard and try a sample flow. This preview never contacts an AI provider.</p></div><span className="preview-caption"><span className="pulse-dot" /> INTERACTIVE PREVIEW</span></div>
        <div className="demo-frame">
          <div className="demo-sidebar"><a className="demo-brand" href="#playground"><span className="mark small"><i /><i /><i /></span> subbridge</a><div className="demo-workspace"><span className="workspace-avatar">S</span><div><b>Demo workspace</b><small>Sample instance</small></div><ChevronDown size={13} /></div><small className="demo-nav-label">WORKSPACE</small><a className="demo-nav" href="#playground"><Layers3 size={15} /> Overview</a><a className="demo-nav active" href="#playground"><MessageSquare size={15} /> Playground</a><a className="demo-nav" href="#playground"><FileClock size={15} /> History <em>{history.length}</em></a><small className="demo-nav-label manage-label">MANAGE</small><a className="demo-nav" href="#docs"><Cpu size={15} /> Providers</a><a className="demo-nav" href="#docs"><CircleHelp size={15} /> Settings</a><div className="demo-sidebar-bottom"><div className="demo-safe"><ShieldCheck size={14} /><span><b>Demo only</b><small>No provider connection</small></span></div><div className="demo-host"><span className="led" /> {gatewayUrl.replace(/^https?:\/\//, "")}</div></div></div>
          <div className="demo-main"><div className="demo-topbar"><div className="crumb">SubBridge <i>/</i> <b>Playground</b></div><span className="demo-health"><i /> Gateway preview</span><span className="demo-token"><LockKeyhole size={13} /> Token protected</span></div>
            <div className="demo-content"><div className="demo-title"><div><small>EXPERIMENT</small><h3>Playground</h3><p>Try a sample request in a simulated environment.</p></div><span className="demo-chip"><Sparkles size={12} /> SAMPLE MODE</span></div>
              <div className="demo-workarea"><div className="demo-panel composer"><div className="panel-title"><div><b>New request</b><small>Plain chat completion · no tools</small></div><span className="request-pill"><Zap size={12} /> Request</span></div><label>PROVIDER</label><div className="provider-select">{(["Codex CLI", "Ollama"] as Provider[]).map((item) => <button key={item} onClick={() => selectProvider(item)} className={item === provider ? "selected" : ""}><span className={item === "Codex CLI" ? "codex-glyph" : "ollama-glyph"}>{item === "Codex CLI" ? <Terminal size={14} /> : <Cpu size={14} />}</span><span><b>{item}</b><small>{item === "Codex CLI" ? "CLI · sample" : "Local · sample"}</small></span>{item === provider && <CheckCircle2 size={14} />}</button>)}</div>
                <label htmlFor="sample-model">MODEL <small>EXAMPLE OPTIONS · NOT CONNECTED</small></label><select id="sample-model" value={model} onChange={(event) => setModel(event.target.value)}>{models[provider].map((item) => <option key={item}>{item}</option>)}</select><label htmlFor="sample-prompt">MESSAGE</label><textarea id="sample-prompt" rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask a sample question…" maxLength={500} /><div className="composer-bottom"><span>{prompt.length} / 500</span><label className="switch-row"><input type="checkbox" checked={streaming} onChange={(event) => setStreaming(event.target.checked)} /> Stream (preview)</label></div><button className="demo-run" onClick={sendDemo} disabled={running || !prompt.trim()}>{running ? <><span className="spinner" /> Simulating…</> : <><Play size={13} fill="currentColor" /> Run sample request</>}</button><p className="sample-disclaimer">Demo uses a fixed example response. No inference occurs.</p></div>
                <div className="demo-panel response"><div className="panel-title"><div><b>Response</b><small>{running ? "Simulating sample…" : response ? "Completed · example response" : "Waiting for a sample request"}</small></div>{response && <span className="success-badge"><Check size={12} /> Sample</span>}</div>{running ? <div className="response-loading"><span /><span /><span /></div> : response ? <div className="sample-answer">{response}<small>Illustrative text · not generated by an AI</small></div> : <div className="response-placeholder"><div className="placeholder-mark"><MessageSquare size={19} /></div><b>Your sample response appears here</b><span>Pick a sample provider and run a prompt.</span></div>}
                  <div className="metrics-grid"><Metric title="Total time" value={response ? "2.41 s" : "—"} icon={<Clock3 size={13} />} /><Metric title="Provider time" value={response ? "2.12 s" : "—"} icon={<Activity size={13} />} /><Metric title="Input tokens" value="Not reported" icon={<ArrowDownRight size={13} />} /><Metric title="Output tokens" value="Not reported" icon={<ArrowUpRight size={13} />} /></div><div className="demo-meta"><span>STREAM STATUS</span><b>{!streaming ? "Off" : response ? "Completed · sample" : "Ready"}</b><span>PROVIDER / MODEL</span><b>{provider} · {model.split(" ·")[0]}</b></div>
                </div></div>
              <div className="demo-history"><div className="history-heading"><div><b><Clock3 size={14} /> Recent requests</b><small>Sample history · resets when this page reloads</small></div><span>DEMO DATA</span></div><div className="history-table"><div className="history-head"><span>TIME</span><span>PROVIDER</span><span>MODEL</span><span>DURATION</span><span>OUTCOME</span></div>{history.map((item, index) => <div className="history-row" key={`${item.time}-${index}`}><span>{item.time}</span><span className="history-provider"><i className={item.provider === "Codex CLI" ? "codex-glyph" : "ollama-glyph"}>{item.provider === "Codex CLI" ? <Terminal size={12} /> : <Cpu size={12} />}</i>{item.provider}</span><code>{item.model}</code><span>{item.duration}</span><b className="history-success"><Check size={11} /> {item.outcome}</b></div>)}</div></div>
            </div><div className="demo-bottom-note"><span><LockKeyhole size={13} /> Preview is isolated from your gateway and provider accounts.</span><button onClick={() => setGatewayUrl(gatewayUrl.endsWith("8787") ? "http://127.0.0.1:8788" : "http://127.0.0.1:8787")}>Configuration preview <ArrowRight size={12} /></button></div>
          </div>
        </div>
      </section>

      <section id="how" className="how-section section-wrap"><div className="section-heading"><div><div className="eyebrow">THE REQUEST PATH</div><h2>Small surface. Clear boundaries.</h2><p>SubBridge routes supported text requests through the adapters you choose to configure.</p></div></div><div className="architecture"><div className="arch-top"><ArchNode icon={<Code2 />} overline="YOUR PERSONAL APP" title="OpenAI SDK / HTTP" detail="Local client request" /></div><div className="arch-stem" /><div className="arch-mid"><ArchNode icon={<Layers3 />} overline="LOCAL GATEWAY" title="SubBridge API" detail="Auth · validation · timeout" accent /><span className="arch-endpoint">127.0.0.1:8787/v1</span></div><div className="arch-stem short" /><div className="arch-router"><div /><span>PROVIDER ROUTER</span><div /></div><div className="arch-branches"><i /><i /></div><div className="arch-providers"><ArchNode icon={<Terminal />} overline="SUPPORTED CLI" title="Codex CLI" detail="Existing supported login" /><ArchNode icon={<Cpu />} overline="LOCAL HTTP API" title="Ollama" detail="Installed local models" /></div><div className="arch-return"><span /><b>OpenAI-shaped response</b><span /></div><p className="arch-note">Provider terms, feature support, authentication and usage limits still apply. Cloud providers may receive prompts.</p></div>
        <div className="steps-grid"><Step number="01" title="Install locally" detail="Install dependencies and run the setup wizard on your machine." /><Step number="02" title="Sign in with provider" detail="Authenticate through each provider's own supported CLI workflow." /><Step number="03" title="Connect your project" detail="Point a compatible client at the loopback API and use a local gateway token." /><Step number="04" title="Receive a response" detail="SubBridge normalizes the supported text completion shape for your app." /></div></section>

      <section id="features" className="features-section"><div className="section-wrap"><div className="section-heading"><div><div className="eyebrow">BUILT FOR MAKING</div><h2>The pieces your prototype needs.</h2><p>Concrete building blocks for personal projects—without overstating provider compatibility.</p></div><span className="feature-side-note"><span className="led" /> IMPLEMENTED CAPABILITIES</span></div><div className="feature-grid">{features.map(({ icon: Icon, title, desc }, index) => <article className="feature-card" key={title}><div className="feature-icon"><Icon size={18} /></div><span className="feature-index">0{index + 1}</span><h3>{title}</h3><p>{desc}</p><span className="feature-line" /></article>)}</div></div></section>

      <section className="quickstart-section section-wrap"><div className="quick-copy"><div className="eyebrow">FAMILIAR CLIENT. LOCAL URL.</div><h2>Keep the SDK.<br /><span>Change the endpoint.</span></h2><p>Use the official OpenAI JavaScript SDK against SubBridge's supported Chat Completions subset. Keep the gateway token on the server side.</p><div className="quick-points"><span><CheckCircle2 size={15} /> Bearer token for your local gateway</span><span><CheckCircle2 size={15} /> Model ID must be supported by your provider</span><span><CheckCircle2 size={15} /> No separate provider key copied into SubBridge</span></div><a href="#docs" className="text-link">Read the integration guide <ArrowRight size={15} /></a></div><div className="code-card"><div className="code-header"><div><i /><i /><i /></div><span>index.mjs</span><button onClick={copy}>{copied ? <Check size={14} /> : <Code2 size={14} />}{copied ? "Copied" : "Copy"}</button></div><pre><code>{code.split("\n").map((line, index) => <span className="code-line" key={`${line}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><em>{highlight(line)}</em></span>)}</code></pre><div className="code-foot"><span><LockKeyhole size={13} /> Keep `SUBBRIDGE_TOKEN` private</span><span>EXAMPLE MODEL ONLY</span></div></div></section>

      <section className="video-section section-wrap"><div className="video-card"><div className="video-copy"><div className="eyebrow">SEE IT IN ACTION</div><h2>A real setup, end to end.</h2><p>The product walkthrough will show provider discovery, the dashboard Playground, response metrics, and a request from an external OpenAI SDK client.</p><span className="video-instruction"><CircleHelp size={15} /> Add your recorded demo video with <code>VITE_DEMO_VIDEO_URL</code>.</span></div><div className="video-stage">{videoUrl ? <iframe src={videoUrl} title="SubBridge demo video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div className="video-placeholder"><div className="video-orbit orbit-a" /><div className="video-orbit orbit-b" /><span className="video-play"><Play size={22} fill="currentColor" /></span><b>Demo video placeholder</b><small>Real recording goes here</small><span className="video-duration">VIBE SPRINT WALKTHROUGH</span></div>}</div></div></section>

      <section id="docs" className="docs-section"><div className="section-wrap docs-layout"><div className="docs-intro"><div className="eyebrow">BUILD SOMETHING WITH IT</div><h2>Docs without<br />the hand-waving.</h2><p>Start with the local setup, then use the routes and examples that match your project.</p><a className="button button-secondary" href={docsUrl || "#docs-list"} target={docsUrl ? "_blank" : undefined} rel={docsUrl ? "noreferrer" : undefined}><BookOpen size={15} /> {docsUrl ? "Open documentation" : "Browse guides below"} <ArrowUpRight size={14} /></a><div className="docs-local-note"><LockKeyhole size={14} /> API and guides shown here are a static public overview. No connection to a local gateway.</div></div><div id="docs-list" className="docs-list">
          <DocItem id="overview" active={docsOpen} setActive={setDocsOpen} icon={<Layers3 />} title="Project overview & architecture">SubBridge is a local HTTP gateway with provider adapters. The gateway authenticates callers, validates text chat requests, applies timeouts and sends work to an implemented adapter. It does not act as a general model proxy.</DocItem>
          <DocItem id="setup" active={docsOpen} setActive={setDocsOpen} icon={<Terminal />} title="Setup and first request">From the existing project checkout: `npm install`, `npm run setup`, `npm run build`, then `npm start`. The setup wizard stores a secure local token in per-user configuration and defaults to loopback binding. Check provider status before selecting a model.</DocItem>
          <DocItem id="api" active={docsOpen} setActive={setDocsOpen} icon={<Code2 />} title="API integration guide">`POST /v1/chat/completions` accepts `model`, `messages`, optional `provider`, and optional `stream`. `/v1/models`, `/v1/providers` and `/health` support discovery and health checks; `/v1` routes require bearer authentication.</DocItem>
          <DocItem id="features" active={docsOpen} setActive={setDocsOpen} icon={<Zap />} title="Supported features & limitations">Basic text Chat Completions and provider-supported streaming are implemented. Codex SSE emits one final response chunk rather than token deltas. Tool calling, multimodal inputs, Responses API and full OpenAI API compatibility are not implemented.</DocItem>
          <DocItem id="trouble" active={docsOpen} setActive={setDocsOpen} icon={<CircleHelp />} title="Troubleshooting">A 401 can indicate an incorrect gateway token or provider login issue. A 502 usually indicates an unsupported model or provider failure. A 504 is a request timeout. Ollama discovery requires its local API to be running; Codex IDs can be saved after a successful request.</DocItem>
          <DocItem id="security" active={docsOpen} setActive={setDocsOpen} icon={<ShieldCheck />} title="Security, privacy & provider policy">The default listener is loopback-only and API calls need a local bearer token. Metadata-only history is the safe default. Cloud-backed provider requests may leave the device. Do not expose the gateway publicly. Provider authentication, terms, rate limits, licensing and subscription rules always apply; personal use does not override them.</DocItem>
        </div></div></section>

      <section className="closing-section section-wrap"><div className="closing-card"><div className="closing-mark"><span className="mark"><i /><i /><i /></span></div><div><div className="eyebrow">A BETTER BOUNDARY FOR PERSONAL AI</div><h2>Your project. Your local gateway.</h2><p>Explore the product preview, then check the repository when its public URL is ready.</p></div><div className="closing-actions"><a className="button button-primary" href="#playground">Explore demo <ArrowRight size={15} /></a>{githubUrl ? <a className="button button-quiet" href={githubUrl} target="_blank" rel="noreferrer"><Github size={15} /> View source</a> : <span className="source-placeholder"><Github size={15} /> Source URL not configured</span>}</div></div></section>
    </main>

    <footer className="site-footer"><div className="section-wrap footer-inner"><a className="wordmark" href="#top"><span className="mark"><i /><i /><i /></span><span>subbridge</span></a><span className="footer-note">Open source. Self-hosted. Provider policy aware.</span><div className="footer-links"><a href="#how">Architecture</a><a href="#features">Features</a><a href="#docs">Documentation</a>{githubUrl && <a href={githubUrl} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a>}</div><span className="copyright">© 2026 SubBridge</span></div></footer>
  </div>;
}

function Metric({ title, value, icon }: { title: string; value: string; icon: ReactNode }) { return <div className="metric"><span>{icon}{title}</span><b>{value}</b></div>; }
function ArchNode({ icon, overline, title, detail, accent = false }: { icon: ReactNode; overline: string; title: string; detail: string; accent?: boolean }) { return <div className={`arch-node ${accent ? "accent" : ""}`}><span className="arch-icon">{icon}</span><div><small>{overline}</small><b>{title}</b><span>{detail}</span></div>{accent && <span className="arch-protected"><LockKeyhole size={12} /> AUTH</span>}</div>; }
function Step({ number, title, detail }: { number: string; title: string; detail: string }) { return <div className="step-card"><span>{number}</span><div><b>{title}</b><p>{detail}</p></div></div>; }
function DocItem({ id, active, setActive, icon, title, children }: { id: string; active: string; setActive: (id: string) => void; icon: ReactNode; title: string; children: ReactNode }) { const open = id === active; return <article className={`doc-item ${open ? "open" : ""}`}><button onClick={() => setActive(open ? "" : id)} aria-expanded={open}><span className="doc-icon">{icon}</span><b>{title}</b><ChevronDown size={16} /></button>{open && <p>{children}</p>}</article>; }
function highlight(line: string): React.ReactNode {
  if (line.trimStart().startsWith("//")) return <span className="syntax-comment">{line}</span>;
  const parts = line.split(/("[^\"]*"|\b(?:const|new|await|import|from|process|env)\b)/g);
  return parts.map((part, i) => part.startsWith('"') ? <span className="syntax-string" key={i}>{part}</span> : /^(const|new|await|import|from)$/.test(part) ? <span className="syntax-keyword" key={i}>{part}</span> : part);
}

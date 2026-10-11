import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { discoverCodex, verifyExecutable, unavailableStatus, knownCodexLocations, mapCodexAuthResult } from "../src/providers/discovery.js";
import { validateRequest } from "../src/providers/types.js";
import { ollamaBaseUrl } from "../src/providers/ollama.js";
import { HistoryStore } from "../src/history.js";
import { CodexJsonlCollector, codexExecArgs } from "../src/providers/codex-cli.js";

test("request validator preserves minimal V1 shape and adds provider/stream fields", () => {
  const result = validateRequest({ model: "gpt-6-luna", messages: [{ role: "user", content: "hello" }] });
  assert.deepEqual(result, { model: "gpt-6-luna", messages: [{ role: "user", content: "hello" }], provider: "codex", stream: false });
  assert.equal(typeof validateRequest({ model: "--help", messages: [{ role: "user", content: "hi" }] }), "string");
  assert.equal(typeof validateRequest({ model: "m", messages: [{ role: "user", content: "hi" }], stream: "yes" }), "string");
  assert.equal(typeof validateRequest({ model: "m", provider: "../../bin/sh", messages: [{ role: "user", content: "hi" }] }), "string");
});

test("Windows discovery refuses cmd/PowerShell shims and honors the override without shell invocation", async () => {
  assert.equal(await verifyExecutable("C:\\tools\\codex.cmd", "override", "win32"), null);
  assert.equal(await verifyExecutable("C:\\tools\\codex.ps1", "override", "win32"), null);
  const found = await discoverCodex({ platform: "win32", env: { CODEX_COMMAND: "codex.cmd", PATH: "C:\\tools" }, home: "C:\\Users\\someone" });
  assert.equal(found, null);
  const locations = knownCodexLocations("win32", { APPDATA: "C:\\Users\\sample\\AppData\\Roaming" }, "C:\\Users\\sample");
  assert.ok(locations.some((path) => path.includes("@openai") && path.includes("codex-win32-x64") && path.endsWith("vendor")));
  assert.ok(locations.every((path) => !path.includes("C:\\Users\\Saisr")));
  assert.ok(knownCodexLocations("win32", { LOCALAPPDATA: "C:\\Users\\sample\\AppData\\Local" }, "C:\\Users\\sample").some((path) => path.includes("OpenAI") && path.endsWith("bin")));
  assert.ok((await import("../src/providers/discovery.js")).knownProviderLocations("claude", "win32", { APPDATA: "C:\\Users\\sample\\AppData\\Roaming" }, "C:\\Users\\sample").some((path) => path.endsWith("cli.js")));
  assert.ok((await import("../src/providers/discovery.js")).knownProviderLocations("ollama", "win32", { LOCALAPPDATA: "C:\\Users\\sample\\AppData\\Local" }, "C:\\Users\\sample").some((path) => path.endsWith("ollama.exe")));
});

test("explicit native executable paths are only accepted after bounded version verification", async () => {
  const root = await mkdtemp(join(tmpdir(), "subbridge-discovery-test-"));
  try {
    const verified = await discoverCodex({ platform: process.platform, env: { CODEX_COMMAND: process.execPath, PATH: "" } });
    assert.equal(verified?.path.toLowerCase(), process.execPath.toLowerCase());
    assert.ok(verified?.version.startsWith("v"));
    const missing = await discoverCodex({ platform: process.platform, env: { CODEX_COMMAND: join(root, process.platform === "win32" ? "codex.exe" : "codex"), PATH: "" } });
    assert.equal(missing, null);
    const timed = await import("../src/providers/discovery.js").then(({ runBounded }) => runBounded(process.execPath, ["-e", "setTimeout(()=>{}, 1000)"], { timeoutMs: 25 }));
    assert.equal(timed.timedOut, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("provider state metadata distinguishes absent, unsupported, and implemented providers", () => {
  const codex = unavailableStatus("codex", false);
  const claude = unavailableStatus("claude", true, "/native/claude", "2.0");
  const ollama = unavailableStatus("ollama", false);
  assert.equal(codex.state, "not-installed");
  assert.equal(claude.supported, false);
  assert.equal(claude.capabilities.auth, "provider-policy-restricted");
  assert.equal(ollama.capabilities.auth, "local-no-auth");
});

test("Codex auth status mapping does not return captured CLI output", () => {
  assert.equal(mapCodexAuthResult(false, null, "").state, "not-installed");
  assert.equal(mapCodexAuthResult(true, 0, "signed in").state, "ready");
  assert.equal(mapCodexAuthResult(true, 1, "Not logged in").state, "auth-required");
  assert.equal(mapCodexAuthResult(true, 1, "opaque output").state, "unknown");
  assert.equal(mapCodexAuthResult(true, null, "", true).state, "unknown");
  assert.equal(mapCodexAuthResult(true, null, "").state, "error");
});

test("Codex JSONL parser handles partial lines, final text, and documented turn usage", () => {
  const parser = new CodexJsonlCollector();
  parser.push('{"type":"turn.started"}\n{"type":"item.updated","item":{"type":"agent_message","text":"not final"}}\n{"type":"item.completed","item":{"type":"agent_message","text":"final ');
  parser.push('answer"}}\n{"type":"turn.completed","usage":{"input_tokens":8,"cached_input_tokens":2,"output_tokens":3}}');
  assert.equal(parser.finish(), "final answer");
  assert.deepEqual(parser.getUsage(), { promptTokens: 8, completionTokens: 3, totalTokens: 11 });
});

test("Codex command arguments disable model shell/tool execution and use stdin for prompt text", () => {
  const request = { model: "gpt-6-luna", messages: [{ role: "user" as const, content: "hello" }], stream: true };
  const args = codexExecArgs(request, "C:\\temporary\\last-message.txt", true);
  assert.equal(args[0], "exec");
  assert.equal(args.at(-1), "-");
  assert.equal(args.includes("shell_tool") && args.includes("unified_exec") && args.includes("code_mode_host"), true);
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  assert.equal(args[args.indexOf("--model") + 1], "gpt-6-luna");
  assert.equal(args.includes("hello"), false);
});

test("Ollama URL is constrained to loopback", () => {
  assert.equal(ollamaBaseUrl("http://127.0.0.1:11434/path"), "http://127.0.0.1:11434");
  assert.throws(() => ollamaBaseUrl("http://example.com:11434"), /localhost/);
  assert.throws(() => ollamaBaseUrl("https://127.0.0.1:11434"), /localhost/);
});

test("Ollama adapter parses JSON and incremental NDJSON text without simulating deltas", async () => {
  const provider = new (await import("../src/providers/ollama.js")).OllamaProvider();
  const originalFetch = globalThis.fetch;
  const pieces: string[] = [];
  const request = { model: "local-model", provider: "ollama" as const, stream: false, messages: [{ role: "user" as const, content: "hello" }] };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: "plain answer" }, prompt_eval_count: 6, eval_count: 4, total_duration: 32_000_000 }), { status: 200 });
    const plain = await provider.completeWithMetrics(request, new AbortController().signal);
    assert.equal(plain.content, "plain answer");
    assert.deepEqual(plain.usage, { promptTokens: 6, completionTokens: 4, totalTokens: 10 });
    assert.equal(plain.providerDurationMs, 32);
    globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: "answer" } }), { status: 200 });
    assert.equal((await provider.completeWithMetrics(request, new AbortController().signal)).usage, undefined);
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"message":{"content":"first"}}\n{"message":{"content":" second"},"done":false}\n{"done":true,"prompt_eval_count":4,"eval_count":3,"total_duration":20000000}\n'));
      controller.close();
    } }), { status: 200 });
    const streamed = await provider.stream({ ...request, stream: true }, new AbortController().signal, (piece) => pieces.push(piece));
    assert.equal(streamed, "first second");
    assert.deepEqual(pieces, ["first", " second"]);
    const measured = await provider.streamWithMetrics({ ...request, stream: true }, new AbortController().signal, () => undefined);
    assert.equal(measured.content, "first second");
    assert.deepEqual(measured.usage, { promptTokens: 4, completionTokens: 3, totalTokens: 7 });
    assert.equal(measured.providerDurationMs, 20);
  } finally { globalThis.fetch = originalFetch; }
});

test("history metadata mode never stores response text; full mode is deletable", async () => {
  const root = await mkdtemp(join(tmpdir(), "subbridge-history-test-"));
  try {
    const metadata = new HistoryStore("metadata", root);
    await metadata.add({ id: "one", timestamp: new Date().toISOString(), provider: "codex", model: "test", durationMs: 1, outcome: "success", prompt: "secret prompt", response: "secret response" });
    assert.equal((await metadata.list())[0]?.response, undefined);
    assert.equal((await metadata.list())[0]?.prompt, undefined);
    const full = new HistoryStore("full", root);
    assert.equal(await full.delete("one"), true);
    assert.deepEqual(await full.list(), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

# SubBridge

## One-line pitch

A local-first gateway that lets personal projects call supported, already-authenticated AI providers through a small OpenAI-shaped Chat Completions interface.

## Problem and solution

Personal prototypes often become tied to one provider SDK. SubBridge supplies a loopback-only HTTP boundary over supported local provider tools, so compatible Chat Completions clients can use a configured Codex CLI or local Ollama installation. Provider authentication remains with the provider's own supported login or local service.

## Architecture

```text
OpenAI-compatible client / local dashboard
                  │ HTTP + local bearer token
                  ▼
        Fastify + TypeScript gateway
          ├── validation, queue, timeout
          ├── persistent model catalog/history
          ├── Codex CLI adapter (isolated workspace)
          └── Ollama HTTP adapter
```

## Key features and stack

- Node.js, TypeScript, Fastify, React, Vite and Tailwind.
- Native Codex CLI discovery, status and completion; Ollama local HTTP support.
- Loopback binding, bearer authentication, input limits, serialized provider work and cancellable SSE.
- Model discovery plus user-saved model IDs; a model is marked verified only after a successful request.
- Local dashboard, optional request history, provider status and response metrics.
- CLI setup/start/doctor/providers/models/status/test commands and a locally packable npm distribution.

## Built during the event

SubBridge's gateway, adapters, dashboard, model catalog, local package CLI, SDK examples, diagnostics and demo materials were assembled as an incremental project. No benchmark or usage-savings claim is made.

## Challenges and decisions

Codex CLI does not provide a dependable documented catalog in this integration, so SubBridge does not invent a list: it remembers successful IDs and supports clearly labeled manual IDs. Codex SSE output may be a final response rather than token deltas; the dashboard and docs say so. Claude Code is detectable but intentionally has no adapter, respecting provider integration and subscription rules.

## Current limitations

The API implements a supported Chat Completions subset only. Tool calls, multimodal content, the Responses API, and full OpenAI compatibility are not implemented. Codex model verification is based on an explicitly successful inference. Ollama requires its local server and installed models. This repository is not published to npm; `npx subbridge` from the public registry is not available unless a release is published later.

## Future roadmap

Expand contract tests, validate provider policy and package naming before release, improve cancellation/diagnostics, and consider other adapters only through provider-approved interfaces.

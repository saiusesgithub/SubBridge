# Contributing to SubBridge

Thanks for helping improve SubBridge. Keep changes focused, preserve the local-first security model, and describe what you tested.

## Development setup

Requirements: Node.js 22.12 or newer and npm. From the repository root:

```sh
npm install
npm run build
npm test
```

Run either application independently:

```sh
npm run dev:gateway
npm run dev:showcase
```

The gateway needs a configured local provider only for real inference. Unit and HTTP tests use test doubles and must not require personal Codex authentication, provider secrets, or billable calls.

## Repository structure

- `apps/gateway/` — Fastify API, CLI, provider adapters, dashboard, docs, examples, and tests.
- `apps/showcase/` — static Vite site; its interactive preview is simulated and makes no provider calls.
- `docs/` — repository-level orientation and deployment guides.
- `examples/` — index to tested SDK examples maintained with the gateway.

## Conventions

- Use TypeScript for application code and keep provider integrations behind the typed provider interfaces.
- Use `spawn` with `shell: false`; never execute model output or HTTP-supplied paths/commands.
- Keep the gateway bound to loopback by default. Do not log tokens, credentials, or prompts unless an explicit history setting permits prompt storage.
- Validate external inputs and bound time, output size, concurrency, and subprocess lifetime.
- Do not claim support or availability that has not been implemented and verified.
- Keep showcase interactions clearly labeled when they use sample data. Do not connect the public showcase to a user's local gateway.

## Tests and pull requests

Before opening a PR, run `npm run build` and `npm test`. For gateway package changes, also run `npm pack --dry-run --workspace=subbridge`. Include the commands and results in the PR description. Keep unrelated formatting or generated files out of the change. Do not include `.env`, provider auth files, local databases, logs, or package archives.

PRs should explain the user-facing change, security/privacy impact, compatibility impact, and any manual verification still needed. Add or update focused tests for changed behavior.

## Adding a provider adapter

1. Review `apps/gateway/src/providers/types.ts`, `registry.ts`, and existing adapters.
2. Implement only documented, provider-approved interfaces. Respect account authorization, licensing, rate limits, and subscription rules; do not extract credentials or proxy a subscription where provider terms disallow it.
3. Declare capability metadata accurately. Unsupported streaming, model listing, usage, and auth status must remain absent/unknown rather than being simulated.
4. Keep text inference free of shell/filesystem tools. Use isolated execution and bounded output where a CLI is required.
5. Add mocked tests for success, auth-required, unavailable, timeout, cancellation, malformed output, and any streaming framing.
6. Document installation, auth, limitations, and manual verification. Never require personal credentials in CI.

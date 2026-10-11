# Getting started

SubBridge runs a local authenticated HTTP gateway for the provider adapters it implements. Node.js 22.12+ and npm are required. Use an authenticated Codex CLI or a running Ollama service.

## Source checkout

```sh
npm install
npm run setup
npm run build
npm start
```

The wizard scans providers, checks supported authentication state without inference, binds to `127.0.0.1`, and stores a generated token in the per-user configuration directory. It does not print the token. Find `SUBBRIDGE_TOKEN` in that private `.env` file and enter it in the dashboard at `http://127.0.0.1:8787`. To preserve the token outside the source tree use the default per-user configuration; `SUBBRIDGE_CONFIG_DIR` can override it.

For a local package build, run `npm pack`, then install the resulting tarball in a clean directory. The package is not published to npm; public `npx subbridge` commands are not available until publication.

```sh
subbridge providers
subbridge models
subbridge doctor --json
```

These commands inspect actual local state; they do not run an inference. Codex currently has no documented catalog command. SubBridge remembers a model after successful inference and lets you add a manual catalog entry, labeled unverified until it succeeds. Ollama discovery uses its running local API.

## Authenticate and request

Provider authentication remains with Codex CLI's supported login or Ollama's local service. SubBridge's gateway bearer token is a separate caller credential. Set the token and a model ID known to your provider in the client environment, then:

```sh
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer $SUBBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"<provider-model-id>","messages":[{"role":"user","content":"Hello from my app!"}]}'
```

`<provider-model-id>` is a placeholder; no model ID is substituted automatically. A sample configured Codex account may support `gpt-6-luna`, but availability depends on that account and provider. Read [integration examples](integrations.md), [API subset](api-reference.md), and [security and private access](deployment-security.md).

## Errors

- **401:** bad/missing SubBridge token, or provider login required on completion.
- **502:** provider failure or unsupported model; check local provider status and model support.
- **504:** request exceeded `SUBBRIDGE_REQUEST_TIMEOUT_MS`.
- **429:** local rate or queue limit reached; SubBridge does not retry automatically.
- **No models:** use manual model entry or run an Ollama discovery refresh; a Codex ID becomes verified after a successful request.

Prompts may leave the machine when a cloud provider is selected. Confirm provider terms, usage allowance, and integration policies; personal/open-source use does not override them.

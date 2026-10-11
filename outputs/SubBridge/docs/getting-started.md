# Use SubBridge from another project

SubBridge is a local gateway for provider adapters already installed on your machine. It listens on `http://127.0.0.1:8787` by default and requires the local gateway bearer token for every `/v1` request.

## Install and start

Requirements: Node.js 22.12 or newer, npm, and either an authenticated Codex CLI or a running local Ollama server.

```sh
git clone <your-subbridge-repository>
cd SubBridge
npm install
npm run setup
npm run dev
```

The setup wizard creates `.env` with a generated token and safe loopback defaults. Keep the token private. `npm run dev` starts the API and dashboard; `npm run build && npm start` serves the production build. The dashboard is at `http://127.0.0.1:8787` in production, and the API base is `http://127.0.0.1:8787/v1`.

Set `SUBBRIDGE_TOKEN` in the calling application's environment to the same value as `SUBBRIDGE_GATEWAY_TOKEN` in SubBridge's `.env`. Do not put the token in browser code or commit it. The dashboard asks for it and keeps it in the current tab's session storage.

## Check providers and models

```sh
curl -H "Authorization: Bearer $SUBBRIDGE_TOKEN" http://127.0.0.1:8787/v1/providers
curl -H "Authorization: Bearer $SUBBRIDGE_TOKEN" http://127.0.0.1:8787/v1/models
```

`/v1/models` returns only IDs advertised by an implemented provider. Ollama models come from its local `/api/tags` endpoint. The Codex CLI currently has no documented model-catalog command, so Codex model discovery is empty; use an explicit Codex-supported model ID in that case. The example `gpt-6-luna` below is not guaranteed to be available to your account.

## First request

```sh
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer $SUBBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-6-luna","messages":[{"role":"user","content":"Hello from my app!"}]}'
```

Use a model supported by the provider selected in the request (`codex` is the default; `ollama` can be selected with `"provider":"ollama"`). The response is an OpenAI-shaped chat completion subset. See [API reference](api-reference.md), [integration examples](integrations.md), and [deployment and security](deployment-security.md).

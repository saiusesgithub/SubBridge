# API reference and troubleshooting

## Authentication and discovery

All `/v1` requests require `Authorization: Bearer <SUBBRIDGE_GATEWAY_TOKEN>`. `GET /health` is a minimal process health check. `GET /v1/providers` reports detected/implemented state. `GET /v1/providers/{id}/status` reports one provider. `GET /v1/models` returns an OpenAI-shaped `list`; add `?provider=ollama` to filter. Only provider-advertised IDs are included. Codex has no documented model-list interface in the inspected CLI, so its list is empty and explicit model IDs remain accepted.

## Chat completion subset

`POST /v1/chat/completions` accepts `model` (required), `messages` (1–100 `system`, `developer`, `user`, or `assistant` text messages), optional `provider` (`codex` default or `ollama`), and optional `stream` boolean. It returns an OpenAI-shaped `chat.completion` with one assistant choice. Accurate provider usage appears in `usage` only when the backend reports it. `X-SubBridge-Request-Duration-Ms` and `X-SubBridge-Provider-Duration-Ms` report server-side total and provider-call time when available.

Supported features: plain text chat completions, optional Ollama incremental SSE, Codex SSE transport, model/provider selection, and cancellation via client disconnect. Unsupported or not promised: full OpenAI API compatibility, embeddings, images/audio, tool/function calls, response formats/JSON mode, logprobs, multiple choices, fine-tuning, files, batches, assistants, and provider-independent model enumeration.

Codex currently yields its completed final message through SSE as one content chunk; it does not provide token-by-token text deltas through this adapter. Ollama emits text deltas as received. A final `subbridge.metrics` SSE event includes timing and available usage. Do not interpret Codex transport streaming as incremental generation.

## Errors

| HTTP status | Meaning | What to check |
| --- | --- | --- |
| 400 | Invalid request, unsupported provider, or streaming unsupported | Request fields and provider capabilities |
| 401 | Gateway token or provider authentication required | `SUBBRIDGE_TOKEN`; run the provider's supported login command |
| 421 / 403 | Host or browser origin rejected | Use the local SubBridge host and port |
| 429 | Local rate or queue limit reached | Wait for active requests to finish |
| 502 | Provider failed, disconnected, or rejected a model | Provider status, model availability, network, account access |
| 504 | Request timeout | Review local timeout configuration and provider response |

The gateway intentionally returns concise provider errors and does not expose authentication tokens or raw provider credential data.

## Troubleshooting

- **401 Invalid gateway token:** copy the local token from `.env`/setup output into `SUBBRIDGE_TOKEN`; restart after changing server config.
- **No Codex models listed:** this is expected until Codex provides a documented catalog. Try an account-supported model ID in the Playground's advanced field.
- **Ollama has no models:** run Ollama and pull one, for example `ollama pull llama3.2`; `/v1/models?provider=ollama` reflects `/api/tags`.
- **Provider unavailable:** check `/v1/providers`, the provider status page, native CLI installation, authentication, and local network access.
- **Timeout:** lower prompt size or increase `SUBBRIDGE_REQUEST_TIMEOUT_MS`; the configured upper bound protects the local process.
- **SDK gives connection refused:** start SubBridge and ensure the SDK is running on the same host (see [deployment](deployment-security.md)).

Subscription compatibility depends on each provider's authentication, licensing, rate-limit, and usage policies. SubBridge does not override those policies. For setup, see [getting started](getting-started.md); for client code, see [integrations](integrations.md).

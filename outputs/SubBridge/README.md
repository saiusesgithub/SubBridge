# SubBridge

SubBridge is a local-first, open-source AI gateway built with Node.js, TypeScript and Fastify. It currently provides a small, non-streaming OpenAI-shaped chat endpoint backed by the Codex CLI. It does **not** claim full OpenAI API compatibility.

## Requirements

- Node.js 20 or newer
- Codex CLI installed and authenticated for the account used to run SubBridge

## Run

```sh
npm install
$env:SUBBRIDGE_TOKEN = "replace-with-a-long-random-local-token"
npm run dev
```

On macOS/Linux, set the token with `export SUBBRIDGE_TOKEN='replace-with-a-long-random-local-token'`. The server binds to `127.0.0.1:8787` by default. If `SUBBRIDGE_TOKEN` is omitted, a random token is generated at startup and printed once in the server log. Treat it as a local secret. Do not bind this service to a public interface; remote binding requires `SUBBRIDGE_ALLOW_REMOTE=true` and is not recommended without a hardened deployment and transport security.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SUBBRIDGE_HOST` | `127.0.0.1` | Listener interface; loopback is enforced unless remote binding is explicitly enabled. |
| `SUBBRIDGE_PORT` | `8787` | Listener port. |
| `SUBBRIDGE_TOKEN` | random per start | Local gateway bearer token. |
| `SUBBRIDGE_REQUEST_TIMEOUT_MS` | `120000` | Provider execution timeout. |
| `SUBBRIDGE_MAX_BODY_BYTES` | `1048576` | Maximum JSON request size. |
| `SUBBRIDGE_PROVIDER` | `codex` | Provider selection; only `codex` is implemented. |
| `CODEX_COMMAND` | `codex` | Codex CLI executable. |
| `SUBBRIDGE_ALLOW_REMOTE` | unset | Must be `true` to bind outside loopback. Avoid this setting for ordinary local use. |

## API

- `GET /health` returns `{"status":"ok"}`.
- `POST /v1/chat/completions` accepts a JSON object with `model` and 1–100 `messages`, where each message has a supported role (`system`, `developer`, `user`, or `assistant`) and string `content`. Optional `stream: false` is accepted. The `model` value is passed to Codex CLI as its model selection. Streaming, tool calls, multimodal content, and other OpenAI API features are not implemented.
- Send `Authorization: Bearer $SUBBRIDGE_TOKEN` (or the equivalent header) on completion requests.

## Curl check

With the server running and `SUBBRIDGE_TOKEN` set in your shell:

```sh
curl --fail-with-body http://127.0.0.1:8787/health
curl --fail-with-body http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer $SUBBRIDGE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"codex","messages":[{"role":"user","content":"Reply with exactly: SubBridge is ready"}]}'
```

## Security model and limits

The adapter passes a single prompt to Codex CLI over stdin using `spawn` with `shell: false` and `codex exec --sandbox read-only --skip-git-repo-check --ephemeral --model <model> --output-last-message <temporary-file> -`. It creates a fresh, empty working directory for every invocation. It also creates a temporary `CODEX_HOME` containing only a copy of the user's Codex `auth.json` when available; global Codex configuration, MCP servers, project instructions, shell profiles, and unrelated environment variables are not passed to the child. The temporary profile, working directory, and last-message file are recursively removed after each call. The invocation disables Codex shell and code execution tool features (`shell_tool`, `unified_exec`, and code mode) while retaining the read-only sandbox. SubBridge never parses a model response as a command or executes generated text. This depends on a Codex CLI version that honors these feature overrides; use a current CLI build and review its behavior before exposing the gateway to other users. Provider errors are logged locally and returned without stderr details or provider credentials.

Requests are serialized through one in-process queue. The timeout aborts the Codex child process. The response shape is a minimal compatibility subset, with placeholder zero usage counts; do not use it as a drop-in OpenAI replacement. The queue and auth token are process-local and intended for a single local instance. Claude and Ollama adapters can be added behind the `Provider` interface; neither is implemented yet.

On Windows, CODEX_COMMAND must point to a directly executable Codex CLI binary because the adapter deliberately does not launch .cmd shims through a shell. 
pm-installed Windows shims are not suitable for shell: false; configure the actual executable if your installation provides one.




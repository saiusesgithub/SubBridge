# Official OpenAI JavaScript SDK example

This runnable client uses the official `openai` JavaScript SDK with SubBridge's local base URL and gateway bearer token. The selected model must be supported by the configured provider; there is no model substitution.

```powershell
cd examples/openai-client
npm install
$env:SUBBRIDGE_TOKEN = '<your local gateway token>'
$env:SUBBRIDGE_MODEL = '<model advertised or saved by SubBridge>'
npm start
```

Git Bash/macOS/Linux:

```sh
cd examples/openai-client && npm install
export SUBBRIDGE_TOKEN='<your local gateway token>'
export SUBBRIDGE_MODEL='<model advertised or saved by SubBridge>'
npm start
```

Run `npm run test:integration` only after reviewing that it performs multiple actual provider requests and may consume usage allowance. It covers normal completion, multi-message context, SSE assembly, invalid request errors, model selection/failure, bad-token rejection and the SDK client's timeout handling. The timeout case uses a 1 ms client-side deadline and may still reach the gateway before cancellation. Use no retries to avoid hidden duplicate requests.

This example tests the supported Chat Completions subset. Tool calling, multimodal content and the Responses API are unsupported. The repository's installable npm tarball does not bundle this example's OpenAI SDK dependency.

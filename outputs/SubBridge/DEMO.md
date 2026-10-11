# SubBridge 2–3 minute demo

Prerequisites: Node.js 22.12+, a configured Codex CLI login or running local Ollama, and the local SubBridge package or repository checkout.

1. In a terminal run `npm run build`, then `npm pack` and install the generated tarball into a clean example folder with `npm install <absolute-path-to-tarball>`.
2. Run `npx subbridge setup` if no per-user configuration exists, then `npx subbridge providers` and `npx subbridge models` to show detected providers and actual advertised/saved model IDs. Codex models may initially be empty; after a successful completion, its model ID is saved and marked verified.
3. Run `npx subbridge start`, open `http://127.0.0.1:8787`, paste the token from the owner-only local config file into the dashboard, then open Playground. Select the ready provider and a saved or advertised model. Send a short prompt and point out response time, provider time and only reported token counts.
4. In the SDK example directory set `SUBBRIDGE_TOKEN` and `SUBBRIDGE_MODEL` from your own local configuration, then run `npm start`. The official OpenAI SDK changes only its base URL and gateway bearer token.
5. Explain that this makes a useful local interface for personal AI projects, while requests still go to the selected provider and remain subject to its authentication, usage limits, terms and subscription rules.

For scripted installation in this repository, use `npm run build`, `npm pack`, `npm install <tarball>` and `subbridge --help`. The package is local-only and has not been published to the npm registry.

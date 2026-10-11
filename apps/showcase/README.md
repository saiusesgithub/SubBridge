# SubBridge Showcase

A standalone, static public showcase for SubBridge. The interactive dashboard preview is deliberately simulated: it makes no AI calls, does not connect to a SubBridge gateway, and never requests credentials. It can be deployed independently to Vercel.

## Run locally

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Open the loopback URL printed by Vite. Validate and build the static site with:

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

## Deploy to Vercel

1. Push this standalone showcase directory to a repository or monorepo when ready; no push is performed by this project task.
2. In the existing Vercel project, set **Root Directory** to `apps/showcase`. This site is standalone and has no dependency on the gateway source tree.
3. Use the Vite framework preset, install command `npm install`, build command `npm run build`, and output directory `dist`.
4. Optionally configure public URLs:
   - `VITE_GITHUB_URL` — the real source repository URL once available.
   - `VITE_DEMO_VIDEO_URL` — an embeddable URL for the actual demo recording.
   - `VITE_DOCS_URL` — a public documentation URL if documentation is published separately.
5. Redeploy after changing environment variables. Do not add `SUBBRIDGE_TOKEN`, provider credentials, or private auth data. The Vercel frontend has no backend integration.

`vercel.json` rewrites SPA paths to `index.html`. The site uses no server functions, telemetry, gateway endpoint, or provider credentials.

For the full manual settings and a verification checklist, see [`../../docs/deployment.md`](../../docs/deployment.md). Changing the project root is a manual Vercel setting; no deployment is triggered by this repository change.

## Claims and limitations

Product details are based on the SubBridge application documentation. Codex currently emits a final response chunk over SSE rather than token-by-token output; Ollama can stream incremental text. Claude Code is detectable but no adapter is implemented. The API is an OpenAI-shaped Chat Completions subset, not full OpenAI API compatibility. Provider policies, supported features, authentication, and usage limits apply.

## Replace the video placeholder

Set `VITE_DEMO_VIDEO_URL` to a public video embed URL. Without it, the page shows a clearly labeled placeholder—no recording or usage figures are fabricated.

## License

See the core SubBridge repository for its license and release status.

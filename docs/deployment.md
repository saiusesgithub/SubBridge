# Showcase deployment on Vercel

The public showcase is a static Vite application at [sub-bridge-one.vercel.app](https://sub-bridge-one.vercel.app). It does not call a gateway or provider. Moving the source changes the Vercel project configuration required for future deployments; it does not itself update the deployed site.

## Update the existing Vercel project manually

Keep the existing Vercel project and its production environment variables. In **Project Settings → General → Root Directory**, change the root to:

```text
apps/showcase
```

Use these project settings:

- Framework preset: **Vite**
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Development command: `npm run dev`

The showcase has its own package metadata and lockfile and does not depend on files outside `apps/showcase`. Its `vercel.json` contains the SPA fallback. Public-only optional variables are `VITE_GITHUB_URL`, `VITE_DOCS_URL`, and `VITE_DEMO_VIDEO_URL`. Never set `SUBBRIDGE_TOKEN`, Codex credentials, or provider secrets in Vercel.

Changing the root-directory setting alone does not prove deployment success. Preview and verify a deployment before considering the live project updated. The live URL should continue showing the last successful deployment until a later deploy succeeds.

## Verification checklist

1. Confirm the selected Vercel project is the existing SubBridge showcase project.
2. Set root directory to `apps/showcase` and retain the Vite build/output settings above.
3. Build a preview and check `/`, the interactive sample demo, static assets, and SPA fallback paths.
4. Verify the browser makes no requests to localhost, SubBridge API routes, or provider endpoints.
5. Confirm no private variables or credentials were added.
6. Promote only through the project's normal manual release process when ready; this repository task does not deploy.

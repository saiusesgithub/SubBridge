/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_URL?: string;
  readonly VITE_DEMO_VIDEO_URL?: string;
  readonly VITE_DOCS_URL?: string;
}

interface ImportMeta { readonly env: ImportMetaEnv }

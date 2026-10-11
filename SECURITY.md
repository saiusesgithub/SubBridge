# Security Policy

## Security model

SubBridge is designed as a local gateway. The gateway binds to `127.0.0.1` by default, requires a local bearer token for `/v1/*`, checks host/origin constraints, and limits request size, concurrency, and duration. The Codex adapter uses a verified native executable, `spawn` with `shell: false`, an isolated temporary profile/workspace, and read-only execution settings. Generated model text is never executed as a command. History is metadata-only by default; enabling full history stores prompts and responses locally.

These controls reduce exposure but do not make an authenticated gateway safe to expose to the public internet. Keep it on loopback. For remote personal access, use a trusted SSH tunnel or private network with its own access controls; do not bind publicly or forward an unauthenticated port.

## Credentials and privacy

- Never commit `.env`, gateway tokens, provider auth files, cookies, or local state databases.
- Do not copy or extract provider credentials. Use each provider's supported authentication flow.
- Do not print bearer tokens or raw provider authentication command output in logs, tests, screenshots, or issue reports.
- Prompts sent through cloud-backed providers are processed under those providers' terms; local hosting does not mean all inference stays on-device.
- Do not enable full prompt/response history unless the operator intentionally accepts that local storage.

## Supported API scope

SubBridge implements a limited Chat Completions-shaped interface. It is not a complete OpenAI API implementation. Tool calling, multimodal content, and other unsupported endpoints/features are not available. Provider authentication, licensing, usage limits, and subscription policies continue to apply.

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** flow for `saiusesgithub/SubBridge` when repository security advisories are enabled. If that option is unavailable, contact the maintainers privately through their GitHub profile before sharing technical details publicly. Do not open a public issue containing secrets, exploit instructions, or unredacted logs. Include the affected version, impact, and a minimal reproduction; redact credentials and message contents.

There is no guaranteed response-time SLA. Please allow maintainers time to investigate and coordinate a fix before public disclosure.

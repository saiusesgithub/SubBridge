# Public release checklist

- [ ] Confirm the project license and third-party asset/dependency notices.
- [ ] Review all package contents with `npm pack --dry-run`; ensure no `.env`, token, provider credential, database, log or temporary artifact is included.
- [ ] Confirm npm package name availability and ownership before publishing.
- [ ] Add verified dashboard screenshots and accessible alt text.
- [ ] Repeat build, automated tests, local production smoke and clean tarball installation on Windows, macOS and Linux.
- [ ] Verify supported OpenAI JavaScript/Python SDK versions and document precise tested versions.
- [ ] Review Codex CLI and Ollama provider policies, terms, authentication and subscription/usage limits.
- [ ] Run a security review of local host/origin checks, token storage, process isolation and dependency advisories.
- [ ] Confirm public registry README, support policy, versioning and release automation.
- [ ] Do not describe the gateway as fully OpenAI API compatible or promise that prompts stay on-device when a cloud provider is selected.
- [ ] Keep remote binding disabled by default; document private access through an SSH tunnel or private network only.

No package has been published by this release-preparation task.

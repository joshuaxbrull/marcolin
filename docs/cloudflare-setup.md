# Cloudflare agent setup

Completed in this workspace on 2026-09-08 using [Cloudflare's official agent setup instructions](https://developers.cloudflare.com/agent-setup/prompt.md).

- All 14 official Cloudflare skills are installed and their `SKILL.md` files were verified under `/home/nix/.agents/skills/`. The installer required the project's Node 22 runtime because the system default is Node 18.
- All five MCP server URLs were verified in `/home/nix/.codex/config.toml`.
- Codex reported a successful Cloudflare OAuth login; a subsequent `codex mcp list` outside the sandbox confirmed `OAuth` for the main server.
- Wrangler sign-in also completed. It is separate from the Codex MCP authorization.

| Codex server | URL | Authentication status |
| --- | --- | --- |
| `cloudflare` | `https://mcp.cloudflare.com/mcp` | Signed in with OAuth |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | Public; no login required |
| `cloudflare-bindings` | `https://bindings.mcp.cloudflare.com/mcp` | Configured; authorize on first use |
| `cloudflare-builds` | `https://builds.mcp.cloudflare.com/mcp` | Configured; authorize on first use |
| `cloudflare-observability` | `https://observability.mcp.cloudflare.com/mcp` | Configured; authorize on first use |

Codex was restarted and the new Cloudflare tools are loaded. No access tokens, OAuth codes, or client secrets are stored in this report.

## Manager deployment still pending

The initial Worker is now deployed at `https://marcolin-manager.marcolin-event-locator.workers.dev`. The account ID is pinned in its Wrangler configuration. The main MCP connection provided account discovery; its attempted subdomain write was rejected, while the authorized Wrangler deployment successfully registered the subdomain and deployed the Worker. Resume [manager activation](../manager/README.md) to create/install the GitHub App, configure its secrets, and verify a real manager save on a second device. See [the security review](security-review.md) for deployment checks and exact remaining work.

The GitHub CLI also needs a fresh sign-in because its previous credential was the exposed legacy token that was revoked. The event implementation remains in the local `event-ready` branch; static-site changes have not been pushed or deployed. Old password-portal saves remain disabled until the new manager is activated.

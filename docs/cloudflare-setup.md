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

## Manager deployment

The Worker is deployed at `https://marcolin-manager.marcolin-event-locator.workers.dev`. The account ID is pinned in its Wrangler configuration. The main MCP connection provided account discovery; its attempted subdomain write was rejected, while the authorized Wrangler deployment successfully registered the subdomain and deployed the Worker. The private GitHub App has been created and its secrets configured directly in Cloudflare. Sign-in now redirects to GitHub, and unsigned API requests are rejected. See [the security review](security-review.md) for deployment checks and [manager verification](../manager/README.md) for the remaining real save/device check.

Fresh owner GitHub CLI sign-in is complete, account 2FA is enabled, and both repositories have verified security protections. The old exposed token remains revoked. Static-site release status is recorded in the security review.

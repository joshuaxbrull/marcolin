# Cloudflare deployment

## Manager deployment

The Worker is deployed at `https://marcolin-manager.marcolin-event-locator.workers.dev`. The account ID is pinned in its Wrangler configuration. The private GitHub App has been created and its secrets configured directly in Cloudflare. Sign-in now redirects to GitHub, and unsigned API requests are rejected. See [the security review](security-review.md) for deployment checks and [manager verification](../manager/README.md) for the remaining real save/device check.

Fresh owner GitHub CLI sign-in is complete, account 2FA is enabled, and both repositories have verified security protections. The old exposed token remains revoked. Static-site release status is recorded in the security review.

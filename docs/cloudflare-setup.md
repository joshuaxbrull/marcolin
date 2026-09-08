# Cloudflare deployment

## Manager deployment still pending

The initial Worker is now deployed at `https://marcolin-manager.marcolin-event-locator.workers.dev`. The account ID is pinned in its Wrangler configuration. Resume [manager activation](../manager/README.md) to create/install the GitHub App, configure its secrets, and verify a real manager save on a second device. See [the security review](security-review.md) for deployment checks and exact remaining work.

The GitHub CLI also needs a fresh sign-in because its previous credential was the exposed legacy token that was revoked. The event implementation remains in the local `event-ready` branch; static-site changes have not been pushed or deployed. Old password-portal saves remain disabled until the new manager is activated.

# Location manager

The Worker is deployed and its GitHub App is configured at **https://marcolin-manager.marcolin-event-locator.workers.dev**. `portal/config.json` points to that address. **Installation confirmation and a live end-to-end save are still pending.** [Security and deployment status](../docs/security-review.md) records the checks and remaining work.

To finish the existing installation, open [the private app's installation page](https://github.com/apps/marcolin-manager-joshuaxbrull/installations/new) as `joshuaxbrull`, select **only `marcolin`**, then sign in at the manager address above. The one-time setup helper is no longer needed.

[Cloudflare agent setup](../docs/cloudflare-setup.md) is complete and loaded after restart. Owner GitHub CLI authorization and two-factor authentication are verified. The private app's public identifiers are in `github-app.json`; its client secret and the session key exist only in Cloudflare secrets.

For a new installation, the registration helper can prepare the app without copying secrets into chat or files. The existing manager is already configured; it refuses duplicate registration:

```sh
node scripts/register-manager-app.mjs https://marcolin-manager.marcolin-event-locator.workers.dev
```

Open its one-time local URL on the same computer while signed in as `joshuaxbrull`. If the browser cannot reach that environment, start `cloudflared tunnel --url http://127.0.0.1:8736 --http-host-header 127.0.0.1:8736` and pass the returned HTTPS `trycloudflare.com` origin as the helper's optional third argument. The link expires after 55 minutes. The callback checks state and a browser cookie (Secure over HTTPS), validates the owner and minimal permissions, passes secrets directly to Wrangler, and deploys the connected Worker. Install the app on only `marcolin`, then stop the temporary tunnel. The manual procedure below remains an alternative for another environment.

## Activate in the owner's accounts

Use Node 22 or later from the repository root:

```sh
npm ci
npx wrangler login --device --scopes account:read user:read workers:write workers_scripts:write
npm run manager:build
npx wrangler deploy --config manager/wrangler.jsonc
```

The initial deployment serves the interface but rejects sign-in until configured. Record the actual `https://marcolin-manager.<account>.workers.dev` address returned by Wrangler.

The workspace's previous GitHub CLI credential was the retired token as well. Fresh owner CLI authorization completed on 2026-09-08. CLI authorization is separate from the manager's GitHub App sign-in.

In [GitHub App settings](https://github.com/settings/apps/new), register a private app owned by `joshuaxbrull`. Set the homepage to that Worker address and the callback to `<Worker address>/auth/callback`. Disable webhooks. Request only repository **Contents: read and write** and **Metadata: read**. `github-app-manifest.json` records these settings. Install it on **only `joshuaxbrull/marcolin`**. Keep expiring user authorization enabled. Give the actual manager's GitHub account write access to that repository through the owner's account.

Copy the app's public client ID into this command, using the actual Worker URL:

```sh
node scripts/configure-manager.mjs https://ACTUAL-WORKER-ADDRESS GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET --config manager/wrangler.jsonc
node scripts/set-session-secret.mjs
npm run manager:deploy
```

Enter the client secret only in Wrangler's secret prompt, never in chat, a command argument, a tracked file, or the static portal. The session-secret helper generates a new 256-bit key and sends it directly to Wrangler. Rotating that key signs out existing managers. The public configuration helper updates the Worker origin, callback manifest, and old portal redirect together.

For local Worker development, use an ignored `manager/.dev.vars` containing the two secret bindings. Configure a separate development app/origin; production cookies require HTTPS. `npm run manager:dev` builds the static assets first.

## Confirm rollout

1. The static locator and portal bridge are published, with CI and live browser checks passed. Sign in using the actual manager's GitHub account. Confirm an account without write access cannot edit.
2. Make a reversible phone or hours change. Click **Save and publish** directly from the form. Confirm **Publishing**, followed by **Live** only after GitHub Pages serves the saved JSON bytes.
3. Keep a second phone on the locator. Refocus it or wait up to 60 seconds; verify the changed field. Restore the test value and wait for Live again.
4. Repeat using two manager sessions to confirm an overlapping change prompts for an explicit choice.
5. The separate legacy locator redirect from the `worldcup` repository is also published. This repository's actual `/worldcup/` 3D project remains available directly.

## Authentication and publishing

OAuth uses state and S256 PKCE. GitHub credentials are held in encrypted, expiring HttpOnly cookies whose encryption key exists only in Worker secrets. Every manager API request checks repository write permission. Mutations require matching Origin and a session CSRF token. The server fixes the repository, branch, and directory path; clients cannot select arbitrary targets.

Each draft retains the SHA loaded with its contents. A concurrent save yields a conflict instead of overwriting another manager's changes. The interface stages the active form when Save is clicked, preserves tab drafts, merges independent changes, and asks the manager to resolve edits to the same record. Publication compares the public directory's Git blob hash with the saved SHA; a commit alone is not labeled Live.

The old static portal's public password hash was also the AES decryption key for its stored GitHub token. The credential was revoked on 2026-09-08; GitHub now returns HTTP 401 for it, as recorded in [the retirement report](../docs/credential-retirement.json). Old password-portal saves are disabled until the new manager is activated. Do not restore the old password/token flow during rollback.

References: [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [App manifests](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Event activity

The **Event activity** panel shows QR-link visits and shop, directions, and call clicks for the last 7, 30, or 90 days. It uses the same manager sign-in. See [measurement definitions, storage, and deployment](../docs/event-analytics.md). The existing printed QR URL is unchanged. The public `/events` collector can only add validated activity; reports and directory editing remain private.

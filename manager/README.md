# Location manager

The Worker is deployed at **https://marcolin-manager.marcolin-event-locator.workers.dev**. **GitHub App activation and a live end-to-end save are still pending.** `portal/config.json` deliberately has no destination until the GitHub App is configured. Do not merge the portal migration as a completed rollout before that step. [Security and deployment status](../docs/security-review.md) records the checks and remaining work.

[Cloudflare agent setup](../docs/cloudflare-setup.md) is complete and loaded after restart. The account and deployment are configured; GitHub authorization, App installation, secrets and live save verification remain pending.

The local registration helper can prepare the app without copying secrets into chat or files:

```sh
node scripts/register-manager-app.mjs https://marcolin-manager.marcolin-event-locator.workers.dev
```

Open its one-time local URL on this computer while signed in as `joshuaxbrull`. Create the private app, then install it on only `marcolin`. The helper uses a local-only callback with state and a browser cookie, validates the owner and minimal permissions, passes secrets directly to Wrangler, and deploys the connected Worker. It refuses to create another app once a client ID is configured. The manual procedure below remains an alternative for another environment.

## Activate in the owner's accounts

Use Node 22 or later from the repository root:

```sh
npm ci
npx wrangler login --device --scopes account:read user:read workers:write workers_scripts:write
npm run manager:build
npx wrangler deploy --config manager/wrangler.jsonc
```

The initial deployment serves the interface but rejects sign-in until configured. Record the actual `https://marcolin-manager.<account>.workers.dev` address returned by Wrangler.

The workspace's previous GitHub CLI credential was the retired token as well. Reconnect with `gh auth login --hostname github.com --git-protocol https --web` before pushing the prepared changes. This is separate from registering the manager's GitHub App.

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

1. Sign in using the actual manager's GitHub account. Confirm an account without write access cannot edit.
2. Make a reversible phone or hours change. Click **Save and publish** directly from the form. Confirm **Publishing**, followed by **Live** only after GitHub Pages serves the saved JSON bytes.
3. Keep a second phone on the locator. Refocus it or wait up to 60 seconds; verify the changed field. Restore the test value and wait for Live again.
4. Repeat using two manager sessions to confirm an overlapping change prompts for an explicit choice.
5. Merge the static locator and portal bridge after this check. The old `/portal/` URL then sends managers to GitHub sign-in. Deploy the separate legacy locator redirect from the `worldcup` repository. Preserve this repository's actual `/worldcup/` 3D project.

## Authentication and publishing

OAuth uses state and S256 PKCE. GitHub credentials are held in encrypted, expiring HttpOnly cookies whose encryption key exists only in Worker secrets. Every API request checks repository write permission. Mutations require matching Origin and a session CSRF token. The server fixes the repository, branch, and directory path; clients cannot select arbitrary targets.

Each draft retains the SHA loaded with its contents. A concurrent save yields a conflict instead of overwriting another manager's changes. The interface stages the active form when Save is clicked, preserves tab drafts, merges independent changes, and asks the manager to resolve edits to the same record. Publication compares the public directory's Git blob hash with the saved SHA; a commit alone is not labeled Live.

The old static portal's public password hash was also the AES decryption key for its stored GitHub token. The credential was revoked on 2026-09-08; GitHub now returns HTTP 401 for it, as recorded in [the retirement report](../docs/credential-retirement.json). Old password-portal saves are disabled until the new manager is activated. Do not restore the old password/token flow during rollback.

References: [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [App manifests](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

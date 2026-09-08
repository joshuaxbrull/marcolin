# Security and release status — 2026-09-08

## Completed

- The GitHub credential exposed by the old static portal was revoked. GitHub returned HTTP 401 for it; [the retirement record](credential-retirement.json) contains no credential values.
- The replacement removes the public credential envelope and browser-side token decryption. The Worker checks repository write access, holds tokens in encrypted HttpOnly cookies, verifies OAuth state/PKCE and CSRF, and writes only the fixed directory path using the draft's original SHA.
- Gitleaks 8.30.1 scanned all refs in both non-shallow local checkouts: seven Marcolin commits and 49 legacy `worldcup` commits. It detected no additional token signatures. The known encrypted credential envelope was identified through code review, not by that signature scan. Reports are redacted and held outside the repositories.
- Both repositories have secret-scanning workflows and Dependabot configuration in the release commits. Actions are pinned to exact official commits, checkout does not persist credentials, and job tokens have only read access. The Gitleaks download is pinned and checked against its published SHA-256 digest.
- Gitleaks also scanned both staged release diffs before the local commits: about 2.62 MB for Marcolin and 4.86 KB for the legacy cleanup, with no additional token signatures detected.
- Environment files, Wrangler local state and private-key files are ignored by Git. Existing input documents and card source material are preserved.
- All 31 local tests passed, including the registration helper's wrong-owner/extra-permission rejection and restricted HTTPS callback origin. The browser suite passed its manager publication, device refresh, geolocation and service-worker migration checks using external API fixtures.

## GitHub account and repository verification

Fresh owner CLI authorization completed. GitHub now reports **two-factor authentication enabled** for `joshuaxbrull`. The local CLI credential file has mode `0600`; credentials were not copied into either repository.

For both `joshuaxbrull/marcolin` and `joshuaxbrull/worldcup`, authenticated checks found only the owner as a collaborator, no pending invitations, no deploy keys, no webhooks, no repository Actions secrets, and no open secret-scanning alerts. Dependabot alerts and security updates are now enabled; the initial alert count is zero. Existing secret scanning and push protection remain enabled.

Actions now allow only GitHub-owned actions. Workflow tokens have read access and cannot approve pull requests. Active rulesets block deletion and force pushes to `main` while allowing ordinary manager directory commits. GitHub's generated Pages workflow remains compatible. Repository-wide SHA pinning is not required; the checked-in workflows use exact commit pins.

GitHub still reports non-provider pattern scanning and validity checks disabled: the repository update API did not apply these optional settings. The separate Gitleaks workflow scans Git history. These checks establish the observed configuration, not proof that an account was never compromised.

## Published release

[Marcolin PR #1](https://github.com/joshuaxbrull/marcolin/pull/1) merged as `1debd93b1152b1e9e3ff994c24435e79ce675a8a`; [legacy locator PR #1](https://github.com/joshuaxbrull/worldcup/pull/1) merged as `5f69b39434954981a54841525c1ff3c450578e9d`. Both release workflows and GitHub Pages deployments passed. The two merged release branches were removed, and both local checkouts were fast-forwarded to `main`. Existing untracked input files were preserved.

Public HTTP checks verified that the canonical locator JavaScript, service worker, directory, QR redirect, portal configuration and hub matched the tested release bytes. The directory contains 92 locations. The retired `portal/auth.json` and `portal/portal.js` return HTTP 404. The old site's index and retirement service worker also match their release bytes.

A real Chromium check against the published sites verified the QR redirect, 92 rendered shops, shop selection and popup, zero route requests without GPS sharing, desktop/mobile finder behavior, and the portal bridge to the Cloudflare sign-in page. The World Cup hub card is absent while the actual `/marcolin/worldcup/` page returns 200. There were no uncaught locator page errors. An additional settled-map check confirmed that the map tiles rendered around the selected Maryland shop; the initial screenshot was taken before those requests completed.

## Cloudflare deployment

The initial manager Worker is deployed at **https://marcolin-manager.marcolin-event-locator.workers.dev** in account `f1afb0e98752eec18d3fa2eaa2c3a34f`.

Current version: `acd6096f-e22d-4b97-b4d2-e2687b2831e8`, serving 100% of traffic in deployment `bad2a343-a475-4c86-b4d6-22bcfd19c0c6`. Compatibility date: `2026-09-08`. Preview URLs are disabled. Logs and sampled traces are enabled with query-string redaction; automatic invocation logs are disabled. The account API confirmed the deployment, settings and both secret binding names without returning their values.

The private [Marcolin Manager GitHub App](https://github.com/apps/marcolin-manager-joshuaxbrull) was created by `joshuaxbrull` with only Contents write and Metadata read. Its generated client secret and a fresh session encryption key were sent directly to Cloudflare over stdin, and the Worker was redeployed. Only public app metadata is in Git. The temporary HTTPS registration callback enforced state, a Secure HttpOnly browser cookie, owner and permission validation, and single use. Its connection ended before the browser displayed the final installation link, but configuration completed successfully. The helper and temporary tunnel are now closed; use the existing app's normal GitHub installation page.

After configuration, a browser-user-agent HTTP check verified `/` returns 200, unsigned `/api/session` returns 401, and `/auth/github` redirects to GitHub authorization. These responses use `Cache-Control: no-store`. Earlier checks also verified `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

## Required to finish

1. Confirm the owner installed the private app on **only `joshuaxbrull/marcolin`** and completed manager sign-in. The GitHub CLI's OAuth token cannot inspect GitHub App user installations through `/user/installations`; no broader credential was requested for that check.
2. Verify a real manager login and a reversible save through Publishing to Live, including a second-device refresh. The automated browser checks use fixtures and do not substitute for this production check. The actual manager's GitHub username/access still needs confirmation.

The old password portal's credential remains revoked. Do not restore the exposed-token flow.

References: [GitHub App manifests](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Workers logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Gitleaks](https://github.com/gitleaks/gitleaks).

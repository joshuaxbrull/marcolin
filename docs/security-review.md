# Security and release status — 2026-09-08

## Completed

- The GitHub credential exposed by the old static portal was revoked. GitHub returned HTTP 401 for it; [the retirement record](credential-retirement.json) contains no credential values.
- The replacement removes the public credential envelope and browser-side token decryption. The Worker checks repository write access, holds tokens in encrypted HttpOnly cookies, verifies OAuth state/PKCE and CSRF, and writes only the fixed directory path using the draft's original SHA.
- Gitleaks 8.30.1 scanned all refs in both non-shallow local checkouts: seven Marcolin commits and 49 legacy `worldcup` commits. It detected no additional token signatures. The known encrypted credential envelope was identified through code review, not by that signature scan. Reports are redacted and held outside the repositories.
- Both repositories now have prepared secret-scanning workflows and Dependabot configuration. Actions are pinned to exact official commits, checkout does not persist credentials, and job tokens have only read access. The Gitleaks download is pinned and checked against its published SHA-256 digest.
- Gitleaks also scanned both staged release diffs before the local commits: about 2.62 MB for Marcolin and 4.86 KB for the legacy cleanup, with no additional token signatures detected.
- Environment files, Wrangler local state and private-key files are ignored by Git. Existing input documents and card source material are preserved.
- All 30 local tests passed, including the registration helper's wrong-owner/extra-permission rejection checks. The earlier browser suite passed its manager publication, device refresh, geolocation and service-worker migration checks using external API fixtures.

## Cloudflare deployment

The initial manager Worker is deployed at **https://marcolin-manager.marcolin-event-locator.workers.dev** in account `f1afb0e98752eec18d3fa2eaa2c3a34f`.

Initial version: `6b6d3781-29f5-424d-9db2-7ef57436add8`. Compatibility date: `2026-09-08`. Preview URLs are disabled. Logs and sampled traces are enabled with query-string redaction; automatic invocation logs are disabled. The account API confirmed these settings.

A browser-user-agent HTTP check verified the page returns 200, and `/api/session` and `/auth/github` return 503 until the GitHub App and secrets are configured. All three responses had `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`. A default Python user agent was rejected at Cloudflare's edge; the subsequent browser-user-agent requests reached the Worker.

## Required to finish

GitHub CLI device authorization expired without completion. The active `joshuaxbrull` CLI credential is still invalid; the other saved account was not switched in. Consequently, **the prepared repository changes and workflows have not been pushed, and remote GitHub protections have not yet been changed**.

After reconnecting the owner account:

1. Review repository collaborators, app installations, deploy keys, webhooks, secret-scanning alerts and Actions permissions for `joshuaxbrull/marcolin` and `joshuaxbrull/worldcup`. Inspect the owner's available 2FA and account-security status. These are not covered by the local source scan.
2. Enable GitHub secret scanning/push protection and dependency alerts where available, make Actions tokens read-only, and block force pushes and branch deletion without preventing the manager's normal directory commits. Preserve any stronger existing protections.
3. Complete the private GitHub App registration and install it on **only `joshuaxbrull/marcolin`**. The [registration helper](../scripts/register-manager-app.mjs) validates the owner and permissions, sends generated secrets directly to Wrangler over stdin, and stores only public app metadata in Git. Its local callback rejects missing or forged state/cookies.
4. Verify a real manager login and a reversible save through Publishing to Live, including a second-device refresh. Then publish the static locator/portal changes and the separate old-locator redirect, preserving any newer manager edits in GitHub.

The old password portal cannot save while its credential is revoked. The replacement is intentionally closed until account activation is complete. Do not restore the exposed-token flow.

References: [GitHub App manifests](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Workers logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Gitleaks](https://github.com/gitleaks/gitleaks).

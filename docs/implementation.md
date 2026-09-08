# Event readiness implementation

The canonical production code is `joshuaxbrull/marcolin`. The event release is published on `main` through [PR #1](https://github.com/joshuaxbrull/marcolin/pull/1). The surrounding `worldcup` repository was the older locator deployment; its index and service worker now redirect to the canonical locator through a separate merged release. The actual 3D project at `/marcolin/worldcup/` is preserved, with its hub card temporarily hidden.

## Failures addressed

| Failure | Resulting behavior |
| --- | --- |
| Save could publish the previous list while the active form still held an unstaged edit. | Save stages the current form and validates it before publishing. |
| A fresh GitHub SHA was fetched immediately before overwriting it with stale local contents. | Drafts retain their loaded SHA; conflicts preserve both managers' versions for review. |
| A successful commit was treated as a successful device update. | Publishing is distinct from Live; Live requires readback of matching public directory bytes. |
| Cached directory JSON and old open pages could survive publication. | Network-only directory refresh, validated offline fallback, focus/online/visibility and 60-second refresh; scoped worker migration reloads old clients. |
| A searched place could become a driving origin, including an unrelated result abroad. | Search centers and consented GPS origins are separate. US search candidates are ranked by city/state/address; ambiguous matches prompt a choice. |
| Late route/GPS responses could repaint a route after sharing stopped or a different shop was selected. | Cancellation plus generation guards prevent obsolete results. Without sharing, selection focuses the shop at zoom 14. |
| Changed addresses could retain old coordinates. | Manager must explicitly confirm the pin for the edited address. |
| Static password verification exposed the token's decryption key with the encrypted token. | Public credential files and password portal removed. The legacy token was revoked and now returns HTTP 401. GitHub App authorization runs in a Cloudflare Worker. |
| Several contact fields were outdated; a closed branch remained listed. | 23 sourced field corrections and removal of the confirmed closed Barenburg Park Avenue branch. Existing manager removals stay removed. |
| Added controls left the phone finder with no usable list area. | Mobile sheet sizing and an accessible expand button preserve access to the shop list. |

## Verification

All 31 `npm test` checks passed, covering schema validation, US search ranking, manager conflicts, session encryption/authorization/CSRF, optimistic writes, publication hashing, scoped service-worker caching, QR decoding and print dimensions. `npm run test:browser` covers save/publish/second-device refresh, removals, stale drafts, address/pin validation, lost geolocation consent, out-of-order routes, offline recovery and an empty published directory. External APIs are deterministic fixtures in these browser checks; this is not a claim that production GitHub/Cloudflare authentication has been exercised.

Both GitHub release workflows and Pages deployments passed. Live file comparisons and Chromium checks verified the deployed 92-location directory, QR and portal redirects, shop selection without route requests when GPS is not shared, rendered map tiles, desktop/mobile layouts, and the preserved direct World Cup page. Production manager login/save and second-device propagation still require the owner's confirmation.

`npm run manager:build` and Wrangler's deployment dry-run validate the Worker and its static bundle. Runtime credentials are not bundled into public assets. Dependencies are pinned in a portable lockfile; a clean install's npm audit reported zero vulnerabilities on 2026-09-08.

## Release handoff

- [Security and deployment status](security-review.md): Worker deployed with GitHub App secrets configured; both local Git histories scanned; owner 2FA and remote repository protections verified.
- [Cloudflare agent setup](cloudflare-setup.md): official skills and five MCP connections are installed and loaded after restart.
- [Manager activation and live verification](../manager/README.md): GitHub App creation and secret configuration are complete. Installation confirmation, a real manager login/save and a second-device refresh still need verification.
- [Directory audit](directory-audit.md): 92 retained locations, 87 Census street matches, five pins for manual review, and source notes for every retained record. Prioritize Ocean City stock/phone confirmation and the conflicting Longmeadow address.
- [Card proofs and print specification](../cards/README.md): final production needs a higher-resolution copy of the selected photograph and a physical QR scan.

The site is deployed. The PDFs remain design proofs until the photography and physical print/QR checks are complete. Roll back locator code independently if needed; never restore the public credential envelope.

The exposed legacy credential was revoked on 2026-09-08. [Retirement verification](credential-retirement.json) records GitHub's HTTP 401 authentication response without any credential values. The old password portal is replaced by the configured GitHub App manager.

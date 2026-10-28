# Business-card experience review

## Combined scope

The `codex/qr-card-experience` branch includes PR #17's commit `20eaeb660c2229164f6848a6d596643425d610a8` and the landing/contact update. Merge this combined draft only after review; PR #17's additions must not be applied a second time. It preserves all 94 prior directory records and adds four Johnson-Curran locations (98 total). Census coordinates are street interpolations, not verified entrances.

The printed QR remains `https://joshuaxbrull.github.io/marcolin/hd/`. It still opens the finder immediately and preserves query/hash information and card attribution. A finder link reaches the contact and collection hub, with card attribution retained on the return trip. The landing page provides call, email, and a downloadable vCard using Mike's existing card-proof contact details. No new analytics or external rendering dependencies were added.

## Design and source boundaries

A single 700ms perspective reveal settles into the exact static card position. It runs at most once per tab session, disconnects its observer, never controls scrolling, and never hides content. Reduced-motion, save-data, and low-core devices use the static version. Scripts/fonts can fail without blocking core landing links. The lightweight, decorative inline eyewear illustration is generic, not an accurate product model or Mike's portrait. Its `data-visual-slot="eyewear"` container can accept a separately verified lightweight asset without changing navigation. No vendor images, videos or private assets have been copied.

Contact provenance: `cards/front.html` and `cards/README.md` (Mike Brull, Brand Specialist, 301-639-8001, mbrull@marcolin.com).

Official destinations, researched 2026-10-28:

- [Public Harley-Davidson Eyewear overview and product views](https://www.marcolin.com/en/brand/harley-davidson-eyewear/).
- [MyMarcolin dealer portal](https://mymarcolin.marcolin.com/). Account required; resources depend on account access. No public downloadable current SKU catalog has been verified.
- [Marcolin partner information](https://www.marcolin.com/en/partners/) distinguishes authorized-customer purchasing and multimedia resources.

The `/portal/` route remains the separate location manager sign-in, not the vendor portal. GitHub Pages deploys from `main` at `/`; the private manager is a separate Cloudflare Worker. This change does not alter deployment, credentials, or access settings.

## Pull-request grouping

Open PR inventory on 2026-10-28: #17 locations; #16 setup-node; #15 undici/wrangler; #14 wrangler; #11 sharp/wrangler; #5 pngjs; #4 Playwright; #3 checkout. Each was reported mergeable with successful existing validation at inspection time. That does not establish compatibility when combined.

Group only #17 and this UI change. Leave dependency PRs separate: #11/#14/#15 overlap on Wrangler and the same package lock; #4/#5 also touch the package manifest and lock. Applying all independently can undo a newer resolution or introduce lock conflicts. #3/#16 are major action updates affecting CI execution and deserve a separate review. No PR was approved, merged, closed, or deployed as part of this implementation.

## Verification and limits

Run `npm test`, `npm run manager:build`, `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`, and `CHROMIUM_PATH=/usr/bin/chromium npm run test:landing` (or use the installed Playwright browser without CHROMIUM_PATH).

Landing checks cover 320/360/390/430 widths, 844px landscape, desktop, 44px targets, horizontal reflow, keyboard skip/action focus, heading/link semantics, source attribution, vCard contents, official link targets, repeated navigation, script/font failure, live reduced-motion changes, save-data/low-core fallbacks, and layout shift. Existing browser tests cover QR query/hash, finder/contact round trip, map filtering and empty state, directions, calls, denied/late location, failed external map requests, manager conflicts, publication/second-device refresh, offline directory recovery, and actual service-worker migration. External services are fixtures; these checks do not prove authenticated Marcolin downloads or real manager publication.

Screenshots and lab output are in local `artifacts/` and test output. A cold local mobile sample with 4x CPU throttling, 150ms simulated RTT and 1.6Mbps download recorded CLS 0 and LCP about 0.6s. This is a laboratory sample, not a live deployment comparison, field INP, or a physical device result. Browser keyboard/semantic checks are not a screen-reader listening session.

The existing print tests decode both QR proof PNGs to the stable URL. Physical actual-size print scans on iPhone and Android remain unperformed; printer stock, lighting and camera distance cannot be verified by browser emulation. No print order was initiated.

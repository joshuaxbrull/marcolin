# Event activity

Open the [manager portal](https://marcolin-manager.marcolin-event-locator.workers.dev/), sign in with a GitHub account that has repository write access, and expand **Event activity**. Choose the last 7, 30, or 90 days, optionally filter to the shared QR link, and select **Refresh activity** for updated counts. Reports include daily UTC totals and the top 25 shops by selections, directions clicks, and call clicks.

## What the counts mean

- A visit is a locator page load, including reloads. The printed `/marcolin/hd/` URL redirects to the locator with `entry=card`, preserving other query parameters and the fragment. Other locator links are counted separately. Shared or forwarded QR links still count as QR-link visits.
- Shop selections count deliberate card and map-pin clicks. Loading, searching, automatic GPS selection, directory refreshes, and route updates do not create selection events.
- Directions and call counts record clicks that open an external app. They do not establish completed journeys, calls, purchases, or unique visitors.
- All existing printed designs share one QR URL. Design comparisons require distinct links in future print runs. The current PDFs, images, and printed QR URL are unchanged.
- Tracking starts when the public client and collector are deployed. There is no historical backfill. Offline visits, browser opt-outs (Do Not Track or Global Privacy Control), blocked requests, and network failures can reduce the counts.

## Data and access

The existing manager Worker has a D1 binding named `ANALYTICS_DB`. Each event contains only a random event ID, a server timestamp, one of four action types, the card/direct source, and an optional numeric shop ID. IDs are independent for each event and deduplicate retries; they do not identify visitors. No cookies, visitor names, phone numbers, GPS coordinates, search text, URLs, referrers, or user-agent strings are stored in the analytics tables. No tracking tokens are shipped to the browser.

`POST /events` is the only public analytics endpoint. It validates a bounded JSON document, allows the locator origin, and uses prepared statements. A Cloudflare rate limiter allows up to 600 events per IP per minute per Cloudflare location to curb abuse while allowing shared event/mobile networks. The IP is used only as the transient rate-limit key, and is not saved in D1. Origin checks and this approximate limit do not make client-submitted analytics tamper-proof.

`GET /api/analytics` uses the same encrypted, expiring GitHub session and current repository write-permission check as the directory editor. It is not exposed through public CORS. The manager uses a separate loading/error state for reports so a report failure cannot disable location editing or discard drafts. Expired sessions hide the private interface. Reports are never cached.

The report covers the latest 90 UTC calendar days. A daily 05:17 UTC scheduled handler removes older raw events. Shop names come from the manager's loaded directory; clicks for removed locations remain counted with an ID fallback. New manager-created numeric IDs work without redeploying the collector.

## Initial deployment

Use Node 22. The existing Worker secrets and private GitHub App remain in place.

```sh
npx wrangler login --device --scopes user:read account:read workers:write workers_scripts:write d1:write
npx wrangler d1 create marcolin-event-analytics --location enam --config manager/wrangler.jsonc
```

Record the returned database UUID in the `ANALYTICS_DB` entry of `manager/wrangler.jsonc`, then apply the migration before deploying:

```sh
npx wrangler d1 migrations apply ANALYTICS_DB --local --config manager/wrangler.jsonc
npx wrangler d1 migrations apply ANALYTICS_DB --remote --config manager/wrangler.jsonc
npm test
npm run test:browser
npm run manager:build
npx wrangler deploy --dry-run --config manager/wrangler.jsonc
npm run manager:deploy
```

Deploy the collector and manager before releasing the GitHub Pages client. Confirm a production test visit and each action return 204, duplicate event IDs count once, unauthenticated reports return 401, and the current shared QR redirects with `entry=card`. Remove only the exact production verification event IDs afterward. Never delete genuine activity to reset a report. For subsequent releases, apply only new migrations before deploying.

`manager/src/entry.js` exports only the Worker handler; test helpers remain in the implementation module. The locator service worker moves to shell v6 and caches the new client module. Analytics POSTs bypass its caches and are not queued for replay. Tracking failures never delay browsing or opening phone/maps apps.

Validation includes SQLite tests of the actual migration and aggregation SQL, client opt-out/failure tests, authenticated report tests, and browser coverage of QR attribution, click hooks, automatic selections, mobile reports, report failures, stale responses, expired sign-in, manager publication to a second device, and service-worker migration. Local Wrangler checks additionally exercise D1 migration, actual event writes, duplicate suppression, and the scheduled handler.

References: [D1 prepared statements and batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Cloudflare rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

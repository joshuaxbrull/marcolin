const ENDPOINT = "https://marcolin-manager.marcolin-event-locator.workers.dev/events";
const TYPES = new Set(["visit", "select", "directions", "call"]);

// No cookies or stored visitor identifiers. Every event has its own retry-deduplication ID.
// Keep failures isolated from the locator, including when tracking is blocked or offline.
export function createTracker(browser = globalThis) {
  let visited = false;
  return (type, locationId = null) => {
    try {
      if (browser.navigator.doNotTrack === "1" || browser.navigator.globalPrivacyControl === true || browser.navigator.onLine === false) return;
      if (!TYPES.has(type) || (type === "visit" ? visited || locationId !== null : !Number.isSafeInteger(locationId) || locationId <= 0)) return;
      if (type === "visit") visited = true;
      const source = new URL(browser.location.href).searchParams.get("entry") === "card" ? "card" : "direct";
      const event = { id: browser.crypto.randomUUID(), type, source, locationId };
      void browser.fetch(ENDPOINT, {
        method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
        keepalive: true, referrerPolicy: "no-referrer",
        // A simple CORS request avoids a preflight when a click opens a maps/phone app.
        headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(event)
      }).catch(() => {});
    } catch { /* Browsing, directions, and phone links must always keep working. */ }
  };
}

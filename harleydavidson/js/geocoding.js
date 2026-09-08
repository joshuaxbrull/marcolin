const STATES = { maryland: "MD", delaware: "DE", virginia: "VA", "west virginia": "WV", pennsylvania: "PA", "new york": "NY", "new jersey": "NJ", "north carolina": "NC", "district of columbia": "DC" };
const PLACE_TYPES = new Set(["city", "town", "village", "hamlet", "locality", "suburb", "borough", "municipality"]);
const clean = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const abbr = value => STATES[String(value || "").toLowerCase()] || String(value || "").toUpperCase();

export function parseQuery(query) {
  let text = clean(query).replace(/\s+(united states|usa|us)$/, "");
  let state = "";
  for (const token of [...Object.keys(STATES), ...Object.values(STATES)].sort((a, b) => b.length - a.length)) {
    if (text.endsWith(` ${token.toLowerCase()}`)) {
      state = abbr(token); text = text.slice(0, -token.length).trim(); break;
    }
  }
  return { text, state, address: /\d/.test(text) };
}

export function photonCandidates(features) {
  return features.filter(f => f?.geometry?.type === "Point").map(f => {
    const p = f.properties || {};
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], country: String(p.countrycode || "").toUpperCase(), state: abbr(p.state), name: p.name || p.city || "", city: p.city || p.town || p.village || "", address: [p.housenumber, p.street].filter(Boolean).join(" "), type: p.osm_value || p.type || "", label: [...new Set([p.name, p.city || p.town || p.village, abbr(p.state)].filter(Boolean))].join(", ") };
  });
}

export function rankCandidates(candidates, query, bias) {
  const q = parseQuery(query);
  return candidates.filter(p => p.country === "US" && Number.isFinite(p.lat) && Number.isFinite(p.lng) && (!q.state || p.state === q.state)).map((p, index) => {
    const name = clean(p.name), address = clean(p.address), isPlace = PLACE_TYPES.has(p.type);
    let score = 0;
    const matched = q.address ? q.text.split(" ").every(t => clean(`${p.address} ${p.city} ${p.name}`).includes(t)) : name === q.text || name.startsWith(q.text + " ") || name.endsWith(" " + q.text);
    if (q.address) {
      if (address === q.text) score += 140;
      else if (address && q.text.startsWith(address)) score += 120;
      else if (q.text.split(" ").every(t => clean(`${p.address} ${p.city} ${p.name}`).includes(t))) score += 80;
    } else {
      if (name === q.text) score += 100;
      else if (name.startsWith(q.text + " ") || name.endsWith(" " + q.text)) score += 30;
      if (isPlace) score += 40;
      if (clean(p.city) === q.text && !isPlace) score += 5;
    }
    if (q.state && p.state === q.state) score += 20;
    const distance = bias ? Math.hypot(p.lat - bias.lat, (p.lng - bias.lng) * Math.cos(p.lat * Math.PI / 180)) : 0;
    return { ...p, score, index, distance, matched };
  }).filter(p => p.matched && p.score >= (q.address ? 80 : 40)).sort((a, b) => b.score - a.score || a.distance - b.distance || a.index - b.index);
}

export async function fetchJson(url, { signal, timeout = 8000, ...options } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return await response.json();
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

export async function searchPlaces(query, bias, signal) {
  const params = new URLSearchParams({ q: query, limit: "8", lang: "en", countrycode: "US" });
  const q = parseQuery(query);
  // Explicit cities/states must not be displaced by nearby businesses.
  if (bias && !q.state) { params.set("lat", bias.lat); params.set("lon", bias.lng); }
  try {
    const data = await fetchJson(`https://photon.komoot.io/api/?${params}`, { signal });
    const ranked = rankCandidates(photonCandidates(data.features || []), query, bias);
    if (ranked.length) return ranked;
  } catch (error) { if (signal?.aborted) throw error; }
  const nom = new URLSearchParams({ q: query, format: "jsonv2", limit: "8", countrycodes: "us", addressdetails: "1" });
  const rows = await fetchJson(`https://nominatim.openstreetmap.org/search?${nom}`, { signal });
  return rankCandidates(rows.map(p => ({ lat: Number(p.lat), lng: Number(p.lon), country: String(p.address?.country_code || "").toUpperCase(), state: abbr(p.address?.state), name: p.name || p.address?.city || "", city: p.address?.city || p.address?.town || "", address: [p.address?.house_number, p.address?.road].filter(Boolean).join(" "), type: p.addresstype || p.type, label: p.display_name })), query, bias);
}

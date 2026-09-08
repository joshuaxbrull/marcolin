export const REGION_STATES = { maryland: "MD", delaware: "DE", virginia: "VA", "west virginia": "WV" };

export function normalizeRegionState(value) {
  const text = String(value || "").trim();
  return REGION_STATES[text.toLowerCase()] || text.toUpperCase();
}

export function validateLocations(records) {
  if (!Array.isArray(records) || records.length > 1000) throw new Error("The directory must be a list of at most 1,000 locations.");
  const ids = new Set();
  return records.map((record, index) => {
    if (!record || typeof record !== "object") throw new Error(`Location ${index + 1} is invalid.`);
    const loc = { ...record };
    const label = String(loc.name || `Location ${index + 1}`);
    if (!Number.isSafeInteger(loc.id) || loc.id < 1 || ids.has(loc.id)) throw new Error(`${label}: use a unique numeric ID.`);
    ids.add(loc.id);
    for (const key of ["name", "address", "city"]) {
      if (typeof loc[key] !== "string" || !loc[key].trim() || loc[key].length > 250) throw new Error(`${label}: ${key} is required (250 characters maximum).`);
      loc[key] = loc[key].trim();
    }
    loc.state = normalizeRegionState(loc.state);
    if (!["MD", "DE", "VA", "WV"].includes(loc.state)) throw new Error(`${label}: choose MD, DE, VA, or WV.`);
    if (!["eyewear", "dealership"].includes(loc.kind)) throw new Error(`${label}: choose a location type.`);
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng) || loc.lat < 24 || loc.lat > 50 || loc.lng < -125 || loc.lng > -66) throw new Error(`${label}: confirm a valid US map pin.`);
    loc.phone = String(loc.phone || "").replace(/\D/g, "");
    if (loc.phone && !/^\d{10}$|^1\d{10}$/.test(loc.phone)) throw new Error(`${label}: enter a 10-digit US phone number or leave it empty.`);
    loc.hours = String(loc.hours || "").trim();
    if (loc.hours.length > 500) throw new Error(`${label}: hours are too long.`);
    return loc;
  });
}

export function addressKey(loc) {
  return [loc.address, loc.city, normalizeRegionState(loc.state)].map(v => String(v || "").trim().toLowerCase()).join("|");
}

export function contentEqual(a, b) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

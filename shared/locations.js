export const REGION_STATES = { maryland: "MD", delaware: "DE", virginia: "VA", "west virginia": "WV" };
export const LOCATION_KINDS = { eyewear: "Eyewear shop", dealership: "Motorcycle dealership", event: "Event tent" };
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const eventDates = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isLocationActive(loc, now = new Date()) {
  if (loc.kind !== "event") return true;
  const parts = localDate.formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return loc.startDate <= today && today <= loc.endDate;
}

export function eventDateLabel(loc) {
  if (loc.kind !== "event") return "";
  const range = eventDates.formatRange(new Date(`${loc.startDate}T00:00:00Z`), new Date(`${loc.endDate}T00:00:00Z`));
  return `Available ${range.replace(/\s+/g, " ")}`;
}

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
    if (!Object.hasOwn(LOCATION_KINDS, loc.kind)) throw new Error(`${label}: choose a location type.`);
    if (loc.kind === "event") {
      if (!validDate(loc.startDate) || !validDate(loc.endDate)) throw new Error(`${label}: enter valid event start and end dates.`);
      if (loc.startDate > loc.endDate) throw new Error(`${label}: the event end date must be on or after its start date.`);
    } else {
      delete loc.startDate; delete loc.endDate;
    }
    if (loc.zip) {
      loc.zip = String(loc.zip).trim();
      if (!/^\d{5}(-\d{4})?$/.test(loc.zip)) throw new Error(`${label}: enter a valid US ZIP code or leave it empty.`);
    } else delete loc.zip;
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

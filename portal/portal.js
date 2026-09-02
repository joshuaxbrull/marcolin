const LOCK_KEY = "marcolin-portal-lock";

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const hintsEl = document.getElementById("hints");
const locList = document.getElementById("loc-list");
const saveStatus = document.getElementById("save-status");

let auth = null;
let locations = [];
let hintTimer = 0;
let sessionToken = "";

function showStatus(el, text) {
  el.hidden = !text;
  el.textContent = text || "";
}

function readLock() {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLock(data) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(data));
}

function lockedUntil() {
  const lock = readLock();
  return Number(lock.until || 0);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, saltHex, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((b) => parseInt(b, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return hex(bits);
}

function fromHex(value) {
  return new Uint8Array(String(value).match(/../g).map((b) => parseInt(b, 16)));
}

async function decryptToken(digestHex, blob) {
  const key = await crypto.subtle.importKey("raw", fromHex(digestHex), "AES-GCM", false, ["decrypt"]);
  const iv = fromHex(blob.iv);
  const data = fromHex(blob.data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
}
  return loc.kind === "dealership" ? "dealership" : "eyewear";
}

function nextId() {
  return locations.reduce((max, loc) => Math.max(max, Number(loc.id) || 0), 0) + 1;
}

function formValues() {
  return {
    id: Number(document.getElementById("loc-id").value) || nextId(),
    name: document.getElementById("loc-name").value.trim(),
    address: document.getElementById("loc-address").value.trim(),
    city: document.getElementById("loc-city").value.trim(),
    state: document.getElementById("loc-state").value,
    phone: document.getElementById("loc-phone").value.replace(/\D/g, ""),
    hours: document.getElementById("loc-hours").value.trim(),
    kind: document.getElementById("loc-kind").value,
    lat: picked?.lat ?? null,
    lng: picked?.lng ?? null,
    geocode: picked?.geocode || "",
  };
}

function fillForm(loc) {
  document.getElementById("loc-id").value = loc?.id || "";
  document.getElementById("loc-name").value = loc?.name || "";
  document.getElementById("loc-address").value = loc?.address || "";
  document.getElementById("loc-city").value = loc?.city || "";
  document.getElementById("loc-state").value = loc?.state || "MD";
  document.getElementById("loc-phone").value = loc?.phone || "";
  document.getElementById("loc-hours").value = loc?.hours || "";
  document.getElementById("loc-kind").value = locKind(loc || {});
  picked = loc?.lat != null ? { lat: loc.lat, lng: loc.lng, geocode: loc.geocode || "saved" } : null;
  document.getElementById("loc-geo").textContent = picked
    ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`
    : "No pin yet";
}

function renderList() {
  const q = document.getElementById("list-search").value.trim().toLowerCase();
  const kind = document.getElementById("list-kind").value;
  const rows = locations.filter((loc) => {
    if (kind !== "ALL" && locKind(loc) !== kind) return false;
    if (!q) return true;
    return `${loc.name} ${loc.address} ${loc.city} ${loc.state}`.toLowerCase().includes(q);
  });
  document.getElementById("list-count").textContent = `${rows.length} shown · ${locations.length} total`;
  locList.replaceChildren();
  for (const loc of rows) {
    const li = document.createElement("li");
    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = loc.name;
    const small = document.createElement("small");
    small.textContent = `${loc.address}, ${loc.city}, ${loc.state} · ${locKind(loc)}`;
    title.append(strong, document.createElement("br"), small);
    li.append(title);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => fillForm(loc));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      locations = locations.filter((item) => item.id !== loc.id);
      renderList();
    });
    const actions = document.createElement("div");
    actions.append(edit, del);
    li.append(actions);
    locList.append(li);
  }
}

function hintLabel(item) {
  const bits = [item.name, item.street, item.city, item.state].filter(Boolean);
  return bits.join(", ");
}

async function searchPlaces(query) {
  const local = locations.filter((loc) =>
    `${loc.name} ${loc.city}`.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5).map((loc) => ({
    source: "list",
    name: loc.name,
    street: loc.address,
    city: loc.city,
    state: loc.state,
    lat: loc.lat,
    lng: loc.lng,
    loc,
  }));
  const params = new URLSearchParams({ q: query, limit: "8", lang: "en" });
  const data = await fetch("https://photon.komoot.io/api/?" + params).then((res) => res.json());
  const remote = (data.features || []).map((feat) => {
    const props = feat.properties || {};
    const [lng, lat] = feat.geometry.coordinates;
    return {
      source: "search",
      name: props.name || props.street || query,
      street: [props.housenumber, props.street].filter(Boolean).join(" ") || props.name || "",
      city: props.city || props.name || "",
      state: (props.state || "").length === 2 ? props.state.toUpperCase() : "",
      lat,
      lng,
    };
  });
  return [...local, ...remote].slice(0, 10);
}

function renderHints(items) {
  hintsEl.replaceChildren();
  if (!items.length) {
    hintsEl.hidden = true;
    return;
  }
  hintsEl.hidden = false;
  for (const item of items) {
    const li = document.createElement("li");
    li.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = item.name;
    const small = document.createElement("small");
    small.textContent = `${item.source === "list" ? "In list · " : "Suggestion · "}${hintLabel(item)}`;
    li.append(strong, small);
    li.addEventListener("click", () => {
      if (item.loc) fillForm(item.loc);
      else {
        fillForm({
          name: item.name,
          address: item.street,
          city: item.city,
          state: ["MD", "DE", "VA", "WV"].includes(item.state) ? item.state : document.getElementById("loc-state").value,
          kind: /harley/i.test(item.name) ? "dealership" : "eyewear",
          lat: item.lat,
          lng: item.lng,
          geocode: "photon",
        });
        picked = { lat: item.lat, lng: item.lng, geocode: "photon" };
        document.getElementById("loc-geo").textContent = `${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`;
      }
      hintsEl.hidden = true;
    });
    hintsEl.append(li);
  }
}

async function loadLocations() {
  const { owner, repo, path, branch } = auth.github;
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  locations = await fetch(url + "?t=" + Date.now()).then((res) => res.json());
  renderList();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const now = Date.now();
  const until = lockedUntil();
  if (until > now) {
    const mins = Math.ceil((until - now) / 60000);
    showStatus(loginStatus, `Too many attempts. Try again in ${mins} min.`);
    return;
  }
  const password = document.getElementById("password").value;
  const digest = await hashPassword(password, auth.salt, auth.iterations);
  const lock = readLock();
  if (digest !== auth.hash) {
    const fails = Number(lock.fails || 0) + 1;
    const next = { fails, until: 0 };
    if (fails >= auth.maxAttempts) {
      next.until = now + auth.lockMs;
      next.fails = 0;
      showStatus(loginStatus, "Too many attempts. Locked for 15 minutes.");
    } else {
      showStatus(loginStatus, `Wrong password. ${auth.maxAttempts - fails} tries left.`);
    }
    writeLock(next);
    return;
  }
  writeLock({ fails: 0, until: 0 });
  if (auth.token?.iv && auth.token?.data) {
    try {
      sessionToken = await decryptToken(digest, auth.token);
    } catch {
      showStatus(loginStatus, "Password worked, but the saved GitHub token could not be unlocked.");
      return;
    }
  }
  loginView.hidden = true;
  appView.hidden = false;
  await loadLocations();
});

document.getElementById("place-search").addEventListener("input", () => {
  const q = document.getElementById("place-search").value.trim();
  clearTimeout(hintTimer);
  if (q.length < 3) {
    hintsEl.hidden = true;
    return;
  }
  hintTimer = setTimeout(async () => {
    try {
      renderHints(await searchPlaces(q));
    } catch {
      hintsEl.hidden = true;
    }
  }, 280);
});

document.getElementById("loc-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const loc = formValues();
  const idx = locations.findIndex((item) => item.id === loc.id);
  if (idx >= 0) locations[idx] = { ...locations[idx], ...loc };
  else locations.push(loc);
  renderList();
  showStatus(saveStatus, "Queued locally. Save to GitHub to publish.");
});

document.getElementById("clear-form").addEventListener("click", () => fillForm(null));
document.getElementById("list-search").addEventListener("input", renderList);
document.getElementById("list-kind").addEventListener("change", renderList);

document.getElementById("save-btn").addEventListener("click", async () => {
  const token = sessionToken;
  if (!token) {
    showStatus(saveStatus, "Unlock did not load a GitHub token.");
    return;
  }
  const { owner, repo, path, branch } = auth.github;
  showStatus(saveStatus, "Saving…");
  try {
    const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    }).then((res) => res.json());
    const body = {
      message: "Update Harley-Davidson locator locations from the manager portal.",
      content: btoa(unescape(encodeURIComponent(JSON.stringify(locations, null, 2) + "\n"))),
      sha: meta.sha,
      branch,
    };
    const saved = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!saved.ok) {
      const err = await saved.json().catch(() => ({}));
      throw new Error(err.message || saved.statusText);
    }
    showStatus(saveStatus, "Saved. Pages will rebuild in a minute.");
  } catch (error) {
    showStatus(saveStatus, error.message || "Save failed.");
  }
});

auth = await fetch("./auth.json", { cache: "no-store" }).then((res) => res.json());

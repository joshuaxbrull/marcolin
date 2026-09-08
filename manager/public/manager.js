import { validateLocations, normalizeRegionState, addressKey, contentEqual } from "./shared/locations.js";
import { mergeDraft } from "./draft.js";
const $ = id => document.getElementById(id);
const DRAFT_KEY = "marcolin-manager-draft-v1";
const PUBLICATION_KEY = "marcolin-manager-publication-v1";
let session, records = [], base = [], baseSha = "", busy = false, formDirty = false;
let pinnedAddress = "", currentOriginal = null, pinMap, pinMarker, searchSeq = 0, searchTimer, pendingMerge, publicationSeq = 0;
const clone = value => structuredClone(value);
const status = message => { $("status").textContent = message; };
const fields = ["name", "address", "city", "state", "phone", "hours", "kind", "lat", "lng"];
function storageSet(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Download remains available. */ } }
function storageGet(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } }
function storageRemove(key) { try { sessionStorage.removeItem(key); } catch { /* private browsing */ } }
function formSnapshot() { return Object.fromEntries(["id", ...fields].map(key => [key, $(key).value])); }
function preserve() {
  if (!baseSha) return;
  storageSet(DRAFT_KEY, { records, base, baseSha, form: formSnapshot(), formDirty, pinnedAddress, currentOriginal });
}
function dirty() { return formDirty || !contentEqual(base, records); }
function updateDirty() {
  $("dirty-label").textContent = dirty() ? "Unsaved changes" : "No unsaved changes";
  $("save").disabled = busy || !baseSha || !dirty() || Boolean(pendingMerge);
  preserve();
}
function setBusy(value) {
  if (value) { searchSeq += 1; clearTimeout(searchTimer); $("suggestions").hidden = true; }
  busy = value; const editingBlocked = value || !baseSha || Boolean(pendingMerge); $("fields").disabled = editingBlocked;
  for (const id of ["new", "place-search"]) $(id).disabled = editingBlocked;
  $("refresh").disabled = value || Boolean(pendingMerge); $("logout").disabled = value;
  document.querySelectorAll("#locations button").forEach(button => { button.disabled = editingBlocked; });
  updateDirty();
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(session ? { "X-CSRF-Token": session.csrf } : {}), ...options.headers }, signal: AbortSignal.timeout(20000) });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401) { preserve(); $("login-status").textContent = body.error; $("gate").hidden = false; }
    const error = new Error(body?.error || "The request failed. Your draft is kept."); error.status = response.status; throw error;
  }
  return body;
}
function ensureMap() {
  if (pinMap) return;
  pinMap = L.map("pin-map", { scrollWheelZoom: false }).setView([38.2, -77.4], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(pinMap);
  pinMap.on("click", event => setPin(event.latlng.lat, event.latlng.lng));
}
function showPin() {
  if (!pinMap) return;
  const lat = Number($("lat").value), lng = Number($("lng").value);
  if (!$("lat").value || !$("lng").value || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (pinMarker) pinMap.removeLayer(pinMarker); pinMarker = null; return;
  }
  if (!pinMarker) {
    pinMarker = L.marker([lat, lng], { draggable: true }).addTo(pinMap);
    pinMarker.on("dragend", () => { const at = pinMarker.getLatLng(); setPin(at.lat, at.lng); });
  } else pinMarker.setLatLng([lat, lng]);
  pinMap.setView([lat, lng], 15); pinMap.invalidateSize();
}
function formAddress() { return { address: $("address").value, city: $("city").value, state: $("state").value }; }
function pinStatus() {
  $("pin-status").textContent = pinnedAddress && pinnedAddress === addressKey(formAddress()) ? "Pin confirmed for this address." : "Confirm the pin for this address before publishing.";
}
function setPin(lat, lng) {
  if (busy || !baseSha || pendingMerge) return;
  $("lat").value = Number(lat).toFixed(6); $("lng").value = Number(lng).toFixed(6);
  pinnedAddress = ""; formDirty = true; pinStatus(); showPin(); updateDirty();
}
function fillForm(loc) {
  searchSeq += 1; clearTimeout(searchTimer); $("suggestions").hidden = true;
  $("place-search").value = ""; $("place-status").textContent = "";
  currentOriginal = loc ? clone(loc) : null;
  $("id").value = loc?.id || "";
  for (const key of fields) $(key).value = loc?.[key] ?? (key === "state" ? "MD" : key === "kind" ? "eyewear" : "");
  pinnedAddress = loc ? addressKey(loc) : ""; formDirty = false;
  pinStatus(); showPin(); updateDirty();
}
function stageEdit() {
  if (!formDirty) return;
  if (!$("editor").reportValidity()) throw new Error("Complete the highlighted location details.");
  if (!pinnedAddress || pinnedAddress !== addressKey(formAddress())) throw new Error("Confirm a new pin for the edited address before saving.");
  const loc = { ...(currentOriginal || {}), ...formSnapshot(), id: Number($("id").value) || Math.max(Date.now(), ...records.map(r => r.id + 1)), lat: Number($("lat").value), lng: Number($("lng").value), geocode: "manager-confirmed" };
  const valid = validateLocations([loc])[0];
  const at = records.findIndex(row => row.id === valid.id);
  if (at >= 0) records[at] = valid; else records.push(valid);
  fillForm(valid); renderList(); updateDirty();
}
function describe(row) {
  return row ? `${row.name}\n${row.address}, ${row.city}, ${row.state}\n${row.phone || "No phone"}\n${row.kind === "dealership" ? "Motorcycle dealership" : "Eyewear shop"}\n${row.hours || "No hours"}\nPin: ${row.lat}, ${row.lng}` : "Location removed";
}
function renderList() {
  const q = $("list-search").value.trim().toLowerCase(), kind = $("list-kind").value;
  const rows = records.filter(row => (kind === "ALL" || row.kind === kind) && `${row.name} ${row.address} ${row.city} ${row.state}`.toLowerCase().includes(q));
  $("count").textContent = `${rows.length} shown · ${records.length} total`;
  $("locations").replaceChildren();
  for (const row of rows) {
    const li = document.createElement("li"), details = document.createElement("div"), name = document.createElement("strong"), address = document.createElement("small");
    name.textContent = row.name; address.textContent = `${row.address}, ${row.city}, ${row.state} · ${row.kind === "dealership" ? "Motorcycle dealership" : "Eyewear shop"}`; details.append(name, address);
    const actions = document.createElement("div"); actions.className = "actions";
    const edit = document.createElement("button"); edit.textContent = "Edit"; edit.disabled = busy || !baseSha || Boolean(pendingMerge);
    edit.addEventListener("click", () => { try { stageEdit(); fillForm(records.find(r => r.id === row.id)); $("name").focus(); } catch (error) { status(error.message); } });
    const remove = document.createElement("button"); remove.textContent = "Remove"; remove.className = "remove"; remove.disabled = busy || !baseSha || Boolean(pendingMerge);
    remove.addEventListener("click", () => {
      try {
        if (Number($("id").value) !== row.id) stageEdit();
        records = records.filter(r => r.id !== row.id);
        if (Number($("id").value) === row.id) fillForm(null);
        renderList(); updateDirty(); status(`${row.name} removed from your draft. Save and publish to update the public directory.`);
      } catch (error) { status(error.message); }
    });
    actions.append(edit, remove); li.append(details, actions); $("locations").append(li);
  }
}
function prepareMerge(latest) {
  const result = mergeDraft(base, records, latest.records);
  if (!result.conflicts.length) {
    records = result.merged; base = clone(latest.records); baseSha = latest.sha;
    fillForm(null); renderList(); updateDirty();
    status("Latest changes loaded and your edits preserved. Review the directory, then save and publish."); return;
  }
  pendingMerge = { ...result, latest }; $("conflicts").hidden = false;
  $("conflict-rows").replaceChildren();
  for (const conflict of result.conflicts) {
    const row = document.createElement("div"); row.className = "conflict-row";
    const title = document.createElement("strong"); title.textContent = conflict.mine?.name || conflict.published?.name || conflict.before.name;
    const options = document.createElement("div"); options.className = "conflict-options";
    for (const side of ["mine", "published"]) {
      const label = document.createElement("label"), radio = document.createElement("input"), details = document.createElement("pre");
      radio.type = "radio"; radio.name = `conflict-${conflict.id}`; radio.value = side;
      details.textContent = describe(conflict[side]);
      label.append(radio, document.createTextNode(side === "mine" ? " Use my version" : " Use published version"), details); options.append(label);
    }
    row.append(title, options); $("conflict-rows").append(row);
  }
  status("Another manager changed the same locations. Review the overlapping changes below."); updateDirty();
}
$("resolve").addEventListener("click", () => {
  if (!pendingMerge) return;
  const rows = [...pendingMerge.merged];
  for (const conflict of pendingMerge.conflicts) {
    const selected = document.querySelector(`input[name="conflict-${conflict.id}"]:checked`);
    if (!selected) { status("Choose a version for every overlapping location first."); return; }
    if (conflict[selected.value]) rows.push(conflict[selected.value]);
  }
  records = rows; base = clone(pendingMerge.latest.records); baseSha = pendingMerge.latest.sha;
  pendingMerge = null; $("conflicts").hidden = true;
  fillForm(null); renderList(); setBusy(false); updateDirty(); status("Choices applied to your draft. Save and publish when ready.");
});
async function watchPublication(publication) {
  const seq = ++publicationSeq;
  storageSet(PUBLICATION_KEY, publication);
  const poll = async () => {
    if (seq !== publicationSeq) return;
    try {
      const result = await api(`/api/publication?sha=${publication.sha}`);
      if (seq !== publicationSeq) return;
      if (result.status === "live") { status("Live — the public directory matches your saved changes. Open devices refresh automatically." + (dirty() ? " Your newer draft still has unsaved changes." : "")); storageRemove(PUBLICATION_KEY); return; }
      if (result.status === "superseded") { status("A newer directory has been saved by a manager. Load the latest directory to review it."); storageRemove(PUBLICATION_KEY); return; }
      status(Date.now() - publication.started > 300000 ? "Saved, but publication is taking longer than expected. Still checking the public directory…" : "Saved. Publishing — checking the public directory…");
    } catch (error) { status(error.message); if (error.status === 401 || error.status === 403) return; }
    setTimeout(poll, 10000);
  };
  poll();
}
$("save").addEventListener("click", async () => {
  if (busy || pendingMerge) return;
  try {
    stageEdit(); if (!dirty()) { status("No changes to publish."); return; }
    setBusy(true); publicationSeq += 1; status("Saving…");
    const saved = await api("/api/locations", { method: "PUT", body: JSON.stringify({ records: validateLocations(records), baseSha }) });
    baseSha = saved.sha; base = clone(records); updateDirty();
    watchPublication({ ...saved, started: Date.now() });
  } catch (error) {
    status(error.message);
    if (error.status === 409) { try { prepareMerge(await api("/api/locations")); } catch (failure) { status(failure.message); } }
  } finally { setBusy(false); }
});
$("refresh").addEventListener("click", async () => {
  try {
    stageEdit(); setBusy(true);
    const latest = await api("/api/locations");
    if (dirty()) prepareMerge(latest);
    else { records = latest.records; base = clone(records); baseSha = latest.sha; fillForm(null); renderList(); status("Latest directory loaded."); }
  } catch (error) { status(error.message); } finally { setBusy(false); }
});
$("editor").addEventListener("submit", event => { event.preventDefault(); try { stageEdit(); status("Edit kept in your draft. Save and publish to update the directory."); } catch (error) { status(error.message); } });
$("new").addEventListener("click", () => { try { stageEdit(); fillForm(null); $("place-search").value = ""; $("place-search").focus(); } catch (error) { status(error.message); } });
$("editor").addEventListener("input", event => {
  formDirty = true;
  if (["address", "city", "state", "lat", "lng"].includes(event.target.id)) { pinnedAddress = ""; pinStatus(); }
  if (["lat", "lng"].includes(event.target.id)) showPin();
  updateDirty();
});
$("confirm-pin").addEventListener("click", () => {
  const at = formAddress();
  if (!at.address.trim() || !at.city.trim() || !$("lat").value || !$("lng").value) { status("Enter the complete address and choose its map pin first."); return; }
  pinnedAddress = addressKey(at); formDirty = true; pinStatus(); updateDirty();
});
$("list-search").addEventListener("input", renderList); $("list-kind").addEventListener("change", renderList);
$("place-search").addEventListener("input", () => {
  clearTimeout(searchTimer); const seq = ++searchSeq; const query = $("place-search").value.trim();
  $("suggestions").hidden = true; if (query.length < 3) return;
  searchTimer = setTimeout(async () => {
    try {
      const params = new URLSearchParams({ q: query, countrycode: "US", limit: "8", lang: "en" });
      const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Place search is unavailable. You can enter the address and place its pin on the map.");
      const data = await response.json(); if (seq !== searchSeq) return;
      const choices = (data.features || []).filter(f => f.geometry?.type === "Point" && f.geometry.coordinates?.length === 2 && f.geometry.coordinates.every(Number.isFinite) && String(f.properties?.countrycode).toUpperCase() === "US" && ["MD", "DE", "VA", "WV"].includes(normalizeRegionState(f.properties.state)));
      $("suggestions").replaceChildren(); $("suggestions").hidden = !choices.length;
      $("place-status").textContent = choices.length ? "Select an address, then confirm its pin." : "No matching regional address. Add the city and state, or place the pin manually.";
      for (const choice of choices) {
        const p = choice.properties, li = document.createElement("li"), button = document.createElement("button"); button.type = "button";
        const address = [p.housenumber, p.street].filter(Boolean).join(" ");
        button.textContent = [p.name, address, p.city || p.town, normalizeRegionState(p.state)].filter(Boolean).join(", ");
        button.addEventListener("click", () => {
          if (busy || !baseSha || pendingMerge || seq !== searchSeq) return;
          if (!$("name").value) $("name").value = p.name || "";
          $("address").value = address;
          $("city").value = p.city || p.town || p.village || "";
          $("state").value = normalizeRegionState(p.state);
          setPin(choice.geometry.coordinates[1], choice.geometry.coordinates[0]);
          $("suggestions").hidden = true;
        });
        li.append(button); $("suggestions").append(li);
      }
    } catch (error) { if (seq === searchSeq) $("place-status").textContent = error.message; }
  }, 450);
});
$("export").addEventListener("click", () => {
  preserve();
  const file = new Blob([JSON.stringify(storageGet(DRAFT_KEY) || { records, base, baseSha, form: formSnapshot(), formDirty }, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = "marcolin-location-draft.json"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$("logout").addEventListener("click", async () => { try { preserve(); await api("/auth/logout", { method: "POST", body: "{}" }); location.reload(); } catch (error) { status(error.message); } });
window.addEventListener("beforeunload", event => { if (dirty()) { preserve(); event.preventDefault(); event.returnValue = ""; } });
async function init() {
  try {
    session = await api("/api/session"); $("identity").textContent = session.login;
    $("gate").hidden = true; $("app").hidden = false; $("logout").hidden = false;
    setBusy(true); status("Loading directory…"); ensureMap();
    const latest = await api("/api/locations");
    const saved = storageGet(DRAFT_KEY);
    records = latest.records; base = clone(records); baseSha = latest.sha;
    if (saved?.baseSha && (saved.formDirty || !contentEqual(saved.base, saved.records))) {
      records = saved.records; base = saved.base; baseSha = saved.baseSha;
      currentOriginal = saved.currentOriginal; pinnedAddress = saved.pinnedAddress; formDirty = saved.formDirty;
      for (const [key, value] of Object.entries(saved.form || {})) if (["id", ...fields].includes(key)) $(key).value = value;
      pinStatus(); showPin(); status("Your unsaved draft has been restored. Save will check for newer published changes.");
    } else { fillForm(null); status("Directory loaded. Changes are published when you save."); }
    renderList(); setBusy(false);
    const publication = storageGet(PUBLICATION_KEY); if (publication) watchPublication(publication);
  } catch (error) {
    $("login-status").textContent = error.message;
    if (!$("app").hidden) status(error.message);
    setBusy(false);
  }
}
init();

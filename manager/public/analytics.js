const $ = id => document.getElementById(id);
const number = value => Number(value || 0).toLocaleString();
const columns = ["qrVisits", "directVisits", "selections", "directions", "calls"];
function cell(row, value, heading = false) {
  const el = document.createElement(heading ? "th" : "td");
  if (heading) el.scope = "row";
  el.textContent = value; row.append(el);
}
function rows(id, values, label, fields) {
  const body = $(id); body.replaceChildren();
  for (const value of values) {
    const row = document.createElement("tr");
    cell(row, label(value), true);
    for (const field of fields) cell(row, number(value[field]));
    body.append(row);
  }
}
export function initAnalytics(api, getLocations) {
  let sequence = 0, loaded = false;
  async function refresh() {
    const seq = ++sequence;
    $("activity-results").hidden = true;
    $("activity-status").textContent = "Loading activity…";
    $("activity-refresh").disabled = true;
    try {
      const params = new URLSearchParams({ days: $("activity-days").value, source: $("activity-source").value });
      const report = await api(`/api/analytics?${params}`);
      if (seq !== sequence) return;
      for (const key of columns) $("activity-" + key).textContent = number(report.totals[key]);
      const locations = new Map(getLocations().map(loc => [loc.id, loc]));
      rows("activity-shops", report.shops, row => {
        const loc = locations.get(row.locationId);
        return loc ? `${loc.name} · ${loc.city}, ${loc.state}` : `Location #${row.locationId} (not in the loaded directory)`;
      }, ["selections", "directions", "calls"]);
      rows("activity-daily", report.daily, row => row.day, columns);
      const empty = !report.daily.length;
      $("activity-empty").hidden = !empty;
      $("activity-tables").hidden = empty;
      $("activity-no-shops").hidden = empty || report.shops.length > 0;
      $("activity-shops-table").hidden = report.shops.length === 0;
      $("activity-period").textContent = `Collecting since ${report.startedAt.slice(0, 10)}. Showing ${report.from.slice(0, 10)} through ${report.generatedAt.slice(0, 10)} (UTC). Updated ${new Date(report.generatedAt).toLocaleTimeString()}.`;
      $("activity-results").hidden = false;
      $("activity-status").textContent = "";
      loaded = true;
    } catch (error) {
      if (seq !== sequence) return;
      $("activity-status").textContent = `Activity could not be loaded. ${error.message}`;
    } finally { if (seq === sequence) $("activity-refresh").disabled = false; }
  }
  $("activity").addEventListener("toggle", () => { if ($("activity").open && !loaded) void refresh(); });
  for (const id of ["activity-days", "activity-source"]) $(id).addEventListener("change", () => { void refresh(); });
  $("activity-refresh").addEventListener("click", () => { void refresh(); });
  if ($("activity").open) void refresh();
}

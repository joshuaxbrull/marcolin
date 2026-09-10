import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateLocations, contentEqual, addressKey, isLocationActive, eventDateLabel } from "../shared/locations.js";
import { rankCandidates, parseQuery, photonCandidates } from "../harleydavidson/js/geocoding.js";
const location = { id: 1, name: "Test shop", address: "100 Main St", city: "Ocean City", state: "MD", lat: 38.33, lng: -75.08, phone: "3016398001", hours: "", kind: "eyewear" };
test("directory validates production data and preserves manager removals", async () => {
  const rows = validateLocations(JSON.parse(await readFile("harleydavidson/data/locations.json")));
  for (const id of [6,12,69,71,78,88]) assert.ok(!rows.some(row => row.id === id));
  assert.equal(rows.find(row => row.id === 42).phone, "3018294118");
  assert.equal(rows.find(row => row.id === 32).phone, "8046422290");
});
test("validation rejects duplicate IDs, foreign pins, missing addresses, and invalid phones", () => {
  assert.throws(() => validateLocations([location, location]), /unique/);
  assert.throws(() => validateLocations([{...location, lat:48.8,lng:2.3}]), /US map pin/);
  assert.throws(() => validateLocations([{...location, address:""}]), /address/);
  assert.throws(() => validateLocations([{...location, phone:"123"}]), /phone/);
  assert.deepEqual(validateLocations([]), []);
});
const tent = { ...location, kind: "event", startDate: "2026-09-10", endDate: "2026-09-12" };
test("event tents require real dates in order and preserve their separate category", () => {
  assert.equal(validateLocations([tent])[0].kind, "event");
  for (const dates of [{ startDate: "" }, { endDate: undefined }, { startDate: "2026-02-30" }, { endDate: "2026-09-09" }]) {
    assert.throws(() => validateLocations([{ ...tent, ...dates }]), /date/);
  }
  assert.equal(validateLocations([{ ...tent, endDate: tent.startDate }])[0].endDate, tent.startDate);
  assert.equal(validateLocations([{ ...tent, kind: "eyewear" }])[0].startDate, undefined);
});
test("event availability includes Saturday through midnight in Eastern time", () => {
  for (const [time, active] of [
    ["2026-09-10T03:59:59.999Z", false],
    ["2026-09-10T04:00:00.000Z", true],
    ["2026-09-12T23:59:59.999Z", true],
    ["2026-09-13T03:59:59.999Z", true],
    ["2026-09-13T04:00:00.000Z", false],
    ["2027-09-10T16:00:00.000Z", false],
  ]) assert.equal(isLocationActive(tent, new Date(time)), active, time);
  assert.ok(isLocationActive(location, new Date("2026-09-13T04:00:00Z")));
  const winterTent = { ...tent, startDate: "2026-12-10", endDate: "2026-12-12" };
  assert.ok(isLocationActive(winterTent, new Date("2026-12-13T04:59:59Z")));
  assert.equal(isLocationActive(winterTent, new Date("2026-12-13T05:00:00Z")), false);
  assert.match(eventDateLabel(tent), /Available Sep 10.*12, 2026/);
});
test("the Inlet tent retains the owner's exact pin, address, name, and dates", async () => {
  const rows = validateLocations(JSON.parse(await readFile("harleydavidson/data/locations.json")));
  const inlet = rows.find(row => row.id === 99);
  assert.equal(inlet.name, "Rommel Harley Davidson @ the Inlet");
  assert.equal(inlet.address, "601 S Atlantic Avenue");
  assert.equal(inlet.zip, "21842");
  assert.equal(inlet.lat, 38.326872); assert.equal(inlet.lng, -75.086741);
  assert.equal(inlet.kind, "event");
  assert.equal(inlet.startDate, "2026-09-10"); assert.equal(inlet.endDate, "2026-09-12");
  assert.equal(inlet.hours, "");
});
test("full state names normalize and address edits change the pin binding", () => {
  assert.equal(validateLocations([{...location,state:"Virginia"}])[0].state, "VA");
  assert.notEqual(addressKey(location), addressKey({...location,address:"200 Main St"}));
  assert.equal(addressKey(location), addressKey({...location,state:"Maryland"}));
});
test("Ocean City Maryland outranks the closer Silver Spring seafood business", () => {
  const results = [
    {name:"Ocean City", type:"city", state:"MD", country:"US", lat:38.3315,lng:-75.0874},
    {name:"Ocean City Seafood", city:"Silver Spring", type:"restaurant", state:"MD",country:"US",lat:38.9992,lng:-77.0035},
    {name:"Ocean City",type:"city",state:"NJ",country:"US",lat:39.3,lng:-74.5},
    {name:"Ocean City",type:"city",state:"MD",country:"FR",lat:48.8,lng:2.3}
  ];
  const ranked = rankCandidates(results,"Ocean City MD",{lat:39.4437,lng:-77.5447});
  assert.equal(ranked[0].name,"Ocean City"); assert.equal(ranked[0].lng,-75.0874);
  assert.ok(ranked.every(p=>p.country==="US"&&p.state==="MD"));
});
test("city ambiguity is retained, not silently resolved by proximity", () => {
  const rows = rankCandidates([{name:"Springfield",type:"city",state:"VA",country:"US",lat:38.8,lng:-77.2},{name:"Springfield",type:"city",state:"MD",country:"US",lat:39.4,lng:-77.4}],"Springfield",{lat:38.8,lng:-77.2});
  assert.equal(rows.length,2); assert.equal(rows[0].score,rows[1].score);
  assert.deepEqual(parseQuery("Charleston, West Virginia"),{text:"charleston",state:"WV",address:false});
});
test("street address queries exclude unrelated provider results", () => {
  const rows = rankCandidates([{name:"Optical",address:"100 Main St",city:"Ocean City",type:"house",state:"MD",country:"US",lat:38.3,lng:-75.1},{name:"Other",address:"900 Another St",type:"house",state:"MD",country:"US",lat:38.9,lng:-77}],"100 Main St, Ocean City, MD");
  assert.equal(rows.length,1);
});
test("missing country codes and non-point geometry cannot become US search origins", () => {
  assert.equal(rankCandidates(photonCandidates([{geometry:{type:"Point",coordinates:[2.3,48.8]},properties:{name:"Paris",osm_value:"city"}}]),"Paris").length,0);
});
test("content equality ignores object key order without losing deletions",()=>{
  assert.ok(contentEqual([{a:1,b:2}],[{b:2,a:1}])); assert.ok(!contentEqual([location],[]));
});

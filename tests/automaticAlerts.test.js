import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {evaluateAutomaticAlerts, validateMonitorBundle} from "../src/services/automaticAlerts.js";

const DAY = 86400000;
const now = Date.parse("2026-07-25T12:00:00Z");
const iso = time => new Date(time).toISOString();
const clone = value => structuredClone(value);
const point = {id:"iowa", label:"Iowa · 42, -93.5", lat:42, lon:-93.5, crops:["us-corn"]};
const heatId = "crop/heat/iowa/us-corn";
const droughtId = "crop/drought/iowa/us-corn";
const normal = {p10:.2, p25:.3, median:.5, p75:.7, p90:.8};

function weather(hotDays = 0, {at = now, end = "2026-07-21", wetness = .5} = {}) {
  const days = Array.from({length:30}, (_, i) => ({
    date:new Date(Date.parse(end) - (29 - i) * DAY).toISOString().slice(0, 10),
    max:i >= 23 && i < 23 + hotDays ? 36 : 29, min:20, rain:2,
    rootWetness:wetness, surfaceWetness:wetness,
  }));
  return {schemaVersion:1, generatedAt:iso(at), points:{iowa:{status:"ok", fetchedAt:iso(at),
    url:"https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,GWETTOP&community=AG&latitude=42&longitude=-93.5&time-standard=UTC",
    days, soilClimatology:{baseline:"1991–2020", months:{"07":{root:normal, surface:normal}, "09":{root:normal, surface:normal}}}}}};
}

function drought(value = "severely-dry", verified = true) {
  const map = (layer, scale) => ({period:"2026-07-11", url:`https://drought.emergency.copernicus.eu/api/wms?LAYERS=${layer}&SELECTED_TIMESCALE=${scale}&TIME=2026-07-11`});
  return {schemaVersion:1, status:"ok", fetchedAt:iso(now), periodVerified:verified,
    maps:{shortTerm:map("spaST", "01"), longTerm:map("spaLT", "06"), impactRisk:map("rdria", "01")},
    points:{iowa:{shortTerm:value, longTerm:"near-normal", impactRisk:"no-hotspot"}}};
}

function fao(change = 6, period = "2026-06") {
  const previousDate = new Date(`${period}-01T00:00:00Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  return {status:"ok", fetchedAt:iso(now), source:{url:"https://www.fao.org/worldfoodsituation/foodpricesindex/en/", period, unit:"2014–2016 = 100"},
    data:{monthly:[{month:previousDate.toISOString().slice(0, 7), fao:100}, {month:period, fao:100 + change}],
      headline:{value:100 + change, momPct:change, period, unit:"2014–2016 = 100"}}};
}

function worldBank(change = 12) {
  const period = "2026-06", fields = ["brent", "urea", "dap", "tsp", "potash"];
  const headline = field => ({value:100 + change, momPct:change, period, unit:field === "brent" ? "USD / barrel" : "USD / mt"});
  return {status:"ok", fetchedAt:iso(now), source:{url:"https://www.worldbank.org/en/research/commodity-markets", period, unit:"USD / mt; Brent: USD / barrel"},
    data:{monthly:[{month:"2026-05", ...Object.fromEntries(fields.map(field => [field, 100]))}, {month:period, ...Object.fromEntries(fields.map(field => [field, 100 + change]))}],
      headline:{brent:headline("brent"), urea:headline("urea")},
      fertilizers:[["Urea", "尿素"], ["DAP", "磷酸二铵"], ["TSP", "重过磷酸钙"], ["Potassium chloride", "氯化钾"]].map(([nameEn, nameZh]) => ({nameEn, nameZh, price:100 + change, momPct:change, period, unit:"USD / mt"})),
      agriculture:[{nameEn:"Wheat", nameZh:"小麦", price:200, momPct:0, period, unit:"USD / mt"}]}};
}

const evaluate = (overrides = {}) => evaluateAutomaticAlerts({points:[point], now, ...overrides});
const health = (result, id) => result.health.find(row => row.id === id);

test("heat screen uses the latest seven observed days and actual-day crop stages", () => {
  const result = evaluate({weather:weather(3)});
  assert.ok(validateMonitorBundle(result));
  assert.deepEqual(result.active.map(row => [row.id, row.severity]), [[heatId, "yellow"]]);
  assert.match(result.active[0].sourcePeriod, /2026-07-15.*2026-07-21/);
  assert.equal(result.events[0].type, "new");
  assert.equal(health(result, "weather").status, "ok");
  const earlierHeat = weather(0);
  earlierHeat.points.iowa.days.slice(0, 7).forEach(day => { day.max = 45; });
  assert.equal(evaluate({weather:earlierHeat}).active.length, 0);
  const september = Date.parse("2026-09-05T12:00:00Z");
  const crossing = weather(0, {at:september, end:"2026-09-01"});
  crossing.points.iowa.days.at(-1).max = 40; // September harvest is not critical.
  assert.equal(evaluate({weather:crossing, now:september}).active.length, 0);
  crossing.points.iowa.days.slice(-4, -1).forEach(day => { day.max = 40; }); // August grain fill qualifies.
  assert.equal(evaluate({weather:crossing, now:september}).active[0].severity, "yellow");
});

test("five qualifying hot days escalate red; unchanged checks do not repeat events", () => {
  const initial = evaluate({weather:weather(3)});
  const same = evaluate({weather:weather(3, {at:now + DAY}), previous:initial, now:now + DAY});
  assert.equal(same.events.length, 1);
  assert.equal(same.active[0].firstSeenAt, initial.generatedAt);
  const red = evaluate({weather:weather(5, {at:now + DAY}), previous:same, now:now + DAY});
  assert.equal(red.active[0].severity, "red");
  assert.deepEqual(red.events.map(event => event.type), ["new", "escalated"]);
  const repeated = evaluate({weather:weather(6, {at:now + 2 * DAY}), previous:red, now:now + 2 * DAY});
  assert.equal(repeated.events.length, 2);
  const lower = evaluate({weather:weather(3, {at:now + 2 * DAY}), previous:repeated, now:now + 2 * DAY});
  assert.equal(lower.active[0].severity, "yellow");
  assert.equal(lower.events.length, 2);
});

test("a new source period and a same-period revision preserve stable alert identity", () => {
  const first = evaluate({official:{schemaVersion:1, sources:{fao:fao(6)}}});
  const revised = fao(7);
  revised.fetchedAt = iso(now + DAY);
  const second = evaluate({official:{schemaVersion:1, sources:{fao:revised}}, previous:first, now:now + DAY});
  assert.equal(second.events.length, 1);
  assert.equal(second.active[0].firstSeenAt, first.generatedAt);
  const august = Date.parse("2026-08-10T12:00:00Z"), nextRelease = fao(8, "2026-07");
  nextRelease.fetchedAt = iso(august);
  const third = evaluate({official:{schemaVersion:1, sources:{fao:nextRelease}}, previous:second, now:august});
  assert.equal(third.events.length, 1);
  assert.equal(third.active[0].sourcePeriod, "2026-07");
  assert.equal(third.active[0].id, first.active[0].id);
});

test("data loss retains the alert unverified, once, and restored evidence reconfirms it", () => {
  const initial = evaluate({weather:weather(5)});
  const lost = evaluate({previous:initial, now:now + DAY});
  assert.equal(lost.active[0].severity, "red");
  assert.equal(lost.active[0].state, "unverified");
  assert.deepEqual(lost.events.map(event => event.type), ["new", "verification-lost"]);
  const stillLost = evaluate({previous:lost, now:now + 2 * DAY});
  assert.equal(stillLost.events.length, 2);
  const restored = evaluate({weather:weather(5, {at:now + 2 * DAY}), previous:stillLost, now:now + 2 * DAY});
  assert.equal(restored.active[0].state, "active");
  assert.equal(restored.events.at(-1).type, "reconfirmed");
  assert.equal(restored.active[0].firstSeenAt, initial.generatedAt);
});

test("only fresh below-threshold evidence resolves; recurrence starts a new episode", () => {
  const initial = evaluate({weather:weather(3)});
  const clear = evaluate({weather:weather(0, {at:now + DAY}), previous:initial, now:now + DAY});
  assert.equal(clear.active.length, 0);
  assert.equal(clear.events.at(-1).type, "resolved");
  const unchanged = evaluate({weather:weather(0, {at:now + DAY}), previous:clear, now:now + DAY});
  assert.equal(unchanged.events.length, 2);
  const recurrence = evaluate({weather:weather(3, {at:now + 2 * DAY}), previous:unchanged, now:now + 2 * DAY});
  assert.equal(recurrence.events.at(-1).type, "new");
  assert.notEqual(recurrence.events[0].id, recurrence.events.at(-1).id);
  assert.equal(recurrence.active[0].firstSeenAt, iso(now + 2 * DAY));
});

test("stale, future, discontinuous, wrong-location and malformed weather fail closed", () => {
  for (const modify of [
    value => { value.points.iowa.fetchedAt = iso(now - 4 * DAY); },
    value => { value.points.iowa.fetchedAt = iso(now + 1); },
    value => { value.points.iowa.fetchedAt = "not-a-date"; },
    value => { value.points.iowa.fetchedAt = "2026-07-24T24:00:00Z"; },
    value => { value.points.iowa.status = "error"; },
    value => { value.points.iowa.days.at(-2).date = value.points.iowa.days.at(-1).date; },
    value => { value.points.iowa.days.at(-1).max = 100; },
    value => { value.points.iowa.url = value.points.iowa.url.replace("latitude=42", "latitude=0"); },
    value => { value.points.iowa.url = value.points.iowa.url.replace("time-standard=UTC", "time-standard=LST"); },
    value => { value.schemaVersion = 2; },
  ]) {
    const invalid = weather(5); modify(invalid);
    const result = evaluate({weather:invalid});
    assert.equal(result.active.length, 0);
    assert.equal(health(result, "weather").status, "unavailable");
  }
  assert.equal(evaluate({weather:weather(5, {end:"2026-07-01"})}).active.length, 0);
});

test("GDO needs a verified authoritative period and produces yellow only", () => {
  const unverified = evaluate({drought:drought("extremely-dry", false), weather:weather(0, {wetness:.05})});
  assert.equal(unverified.active.length, 0);
  assert.equal(health(unverified, "drought").status, "unavailable");
  const verified = evaluate({drought:drought("extremely-dry"), weather:weather(0, {wetness:.05})});
  assert.deepEqual(verified.active.map(alert => [alert.id, alert.severity]), [[droughtId, "yellow"]]);
  assert.equal(health(verified, "soil").status, "ok");
  assert.match(verified.active[0].rule.en, /no automatic red/);
  const loss = evaluate({drought:drought("near-normal", false), previous:verified});
  assert.equal(loss.active[0].state, "unverified");
  assert.equal(loss.events.at(-1).type, "verification-lost");
  const normalAgain = evaluate({drought:drought("near-normal"), previous:loss});
  assert.equal(normalAgain.active.length, 0);
  assert.equal(normalAgain.events.at(-1).type, "resolved");
});

test("mismatched map dates/timescales, no-data and expired GDO never assert drought", () => {
  for (const modify of [
    value => { value.maps.shortTerm.url = value.maps.shortTerm.url.replace("SELECTED_TIMESCALE=01", "SELECTED_TIMESCALE=06"); },
    value => { value.maps.shortTerm.url = value.maps.shortTerm.url.replace("TIME=2026-07-11", "TIME=2026-07-01"); },
    value => { value.points.iowa.shortTerm = "no-data"; },
    value => { value.fetchedAt = iso(now - 4 * DAY); },
    value => { value.fetchedAt = iso(now + 1); },
    value => { value.maps.shortTerm.period = "2026-02-31"; },
  ]) {
    const invalid = drought(); modify(invalid);
    assert.equal(evaluate({drought:invalid}).active.length, 0);
  }
});

test("soil dryness and a strong ENSO outlook never independently create crop alerts", () => {
  const enso = {schemaVersion:1, status:"ok", fetchedAt:iso(now), data:{issuedAt:"2026-07-10", phase:"el-nino", nino34:3.5, nino34Month:"2026-06",
    forecasts:Array.from({length:9}, (_, i) => ({season:"JAS", startMonth:new Date(Date.UTC(2026, 6 + i, 1)).toISOString().slice(0, 7),
      elNino:100, neutral:0, laNina:0, roniPercentiles:[2, 2.5, 3, 3.5, 4, 4.5, 5]}))}};
  const result = evaluate({weather:weather(0, {wetness:.01}), enso});
  assert.equal(result.active.length, 0);
  assert.equal(health(result, "enso").status, "ok");
  assert.equal(health(result, "soil").status, "ok");
  assert.match(result.coverage.manual.en, /ENSO and soil moisture provide context/);
});

test("monthly FAO and five cost-series thresholds use validated actual values", () => {
  const result = evaluate({official:{schemaVersion:1, sources:{fao:fao(5), worldBank:worldBank(20)}}});
  assert.equal(result.active.find(alert => alert.id === "market/fao/fao").severity, "yellow");
  assert.equal(result.active.filter(alert => alert.id.startsWith("market/worldBank/") && alert.severity === "red").length, 5);
  assert.equal(health(result, "costs").status, "ok");
  const faoRed = evaluate({official:{schemaVersion:1, sources:{fao:fao(10)}}});
  assert.equal(faoRed.active[0].severity, "red");
  assert.equal(evaluate({official:{schemaVersion:1, sources:{fao:fao(4.99), worldBank:worldBank(9.99)}}}).active.length, 0);
});

test("price data reject invalid units, gaps, future periods and timestamps, stale observations and inconsistent headlines", () => {
  for (const modify of [
    value => { value.source.unit = "USD"; },
    value => { value.source.url = "https://unverified.example/monthly-data"; },
    value => { value.data.headline.unit = "2015 = 100"; },
    value => { value.data.headline.momPct = 99; },
    value => { value.data.headline.value = 999; },
    value => { value.data.monthly[0].month = "2026-04"; },
    value => { value.fetchedAt = iso(now + 1); },
    value => { value.fetchedAt = "invalid"; },
    value => { value.status = "error"; },
    value => { value.source.period = "2026-05"; },
  ]) {
    const record = fao(12); modify(record);
    const result = evaluate({official:{schemaVersion:1, sources:{fao:record}}});
    assert.equal(result.active.length, 0);
    assert.equal(health(result, "fao").status, "unavailable");
  }
  for (const month of ["2026-07", "2026-08", "2026-01"]) {
    assert.equal(evaluate({official:{schemaVersion:1, sources:{fao:fao(12, month)}}}).active.length, 0);
  }
  const malformed = worldBank(20);
  malformed.data.fertilizers.find(row => row.nameEn === "DAP").unit = "USD / short ton";
  const partial = evaluate({official:{schemaVersion:1, sources:{worldBank:malformed}}});
  assert.equal(partial.active.length, 4);
  assert.equal(partial.active.some(alert => alert.id === "market/worldBank/dap"), false);
  assert.equal(health(partial, "costs").status, "unavailable");
});

test("previous state is validated and removal of an input point cannot silently resolve it", () => {
  const initial = evaluate({weather:weather(3)});
  const removed = evaluate({points:[], previous:initial});
  assert.equal(removed.active[0].state, "unverified");
  assert.equal(removed.events.at(-1).type, "verification-lost");
  assert.throws(() => evaluate({previous:{...initial, schemaVersion:99}}), /refusing to discard/);
  assert.throws(() => evaluate({previous:initial, now:now - 1}), /refusing to discard/);
  const malformed = clone(initial);
  malformed.active[0].sources[0].url = "javascript:alert(1)";
  assert.equal(validateMonitorBundle(malformed), null);
  malformed.active[0].sources[0].url = initial.active[0].sources[0].url;
  malformed.events.push(malformed.events[0]);
  assert.equal(validateMonitorBundle(malformed), null);
  malformed.events.pop();
  malformed.generatedAt = "2026-02-31T12:00:00Z";
  assert.equal(validateMonitorBundle(malformed), null);
  const futureEvent = clone(initial);
  futureEvent.events[0].at = iso(now + DAY);
  assert.throws(() => evaluate({previous:futureEvent}), /refusing to discard/);
});

test("event history is bounded to the latest 200 transitions", () => {
  let previous = null;
  for (let i = 0; i < 210; i++) {
    const at = now + i * 1000;
    const record = fao(i % 2 === 0 ? 6 : 0); record.fetchedAt = iso(at);
    previous = evaluate({official:{schemaVersion:1, sources:{fao:record}}, previous, now:at});
  }
  assert.equal(previous.events.length, 200);
  assert.equal(new Set(previous.events.map(event => event.id)).size, 200);
  assert.equal(previous.events.at(-1).type, "resolved");
});

test("generator handles missing feeds, delivery status and corrupt previous state atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wfl-alert-engine-test-"));
  const output = join(directory, "monitor-alerts.json");
  const run = env => spawnSync(process.execPath, ["scripts/evaluate_alerts.mjs", "--data-dir", directory, "--now", iso(now)], {
    cwd:new URL("../", import.meta.url), encoding:"utf8", env:{...process.env, WFL_EMAIL_CONFIGURED:"true", ...env},
  });
  try {
    const generated = run();
    assert.equal(generated.status, 0, generated.stderr);
    const initial = JSON.parse(await readFile(output, "utf8"));
    assert.equal(initial.active.length, 0);
    assert.equal(initial.email.status, "configured");
    assert.equal(health(initial, "weather").status, "unavailable");
    await writeFile(join(directory, "alert-delivery.json"), JSON.stringify({schemaVersion:1, status:"sent", lastSentAt:iso(now), lastAttemptAt:iso(now), sentEventIds:["private-delivery-state"]}));
    assert.equal(run().status, 0);
    const delivered = JSON.parse(await readFile(output, "utf8"));
    assert.deepEqual(delivered.email, {status:"sent", lastSentAt:iso(now), lastAttemptAt:iso(now)});
    assert.equal(JSON.stringify(delivered).includes("private-delivery-state"), false);
    assert.equal(run({WFL_EMAIL_CONFIGURED:"false"}).status, 0);
    const disabled = JSON.parse(await readFile(output, "utf8"));
    assert.deepEqual(disabled.email, {status:"not-configured", lastSentAt:iso(now), lastAttemptAt:iso(now)});
    assert.equal(run({WFL_EMAIL_CONFIGURED:undefined}).status, 0);
    assert.equal(JSON.parse(await readFile(output, "utf8")).email.status, "sent");
    await rm(join(directory, "alert-delivery.json"));
    assert.equal(run({WFL_EMAIL_CONFIGURED:undefined}).status, 0);
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")).email, {status:"sent", lastSentAt:iso(now), lastAttemptAt:iso(now)});
    await writeFile(join(directory, "alert-delivery.json"), JSON.stringify({schemaVersion:1, status:"sent", lastSentAt:iso(now), lastAttemptAt:"2026-02-31T12:00:00Z"}));
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(await readFile(output, "utf8")).email.lastAttemptAt, undefined);
    await writeFile(output, "{corrupt");
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(output, "utf8"), "{corrupt");
    await writeFile(output, "null");
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(output, "utf8"), "null");
  } finally { await rm(directory, {recursive:true, force:true}); }
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterPolicyEvents, policyCountries, policyTypes, policyCommodities} from "../src/services/policyEvents.js";

const registry = JSON.parse(readFileSync(new URL("../src/data/policyEvents.json", import.meta.url), "utf8"));
const events = registry.events;

test("policy registry has unique bilingual sourced historical records, with honest dates", () => {
  assert.equal(registry.mode, "editorial-registry");
  assert.ok(events.length >= 8);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  const now = new Date().toISOString().slice(0, 10);
  for (const event of events) {
    assert.ok(policyCountries[event.country]);
    assert.ok(policyTypes[event.type]);
    assert.ok(event.commodities.length);
    for (const commodity of event.commodities) assert.ok(policyCommodities[commodity]);
    for (const field of ["title", "summary", "transmission"]) {
      assert.ok(event[field].zh.trim());
      assert.ok(event[field].en.trim());
    }
    for (const date of [event.eventDate, event.publishedAt, event.verifiedAt, event.effectiveDate].filter(Boolean)) {
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), date);
      assert.ok(date <= now, `${event.id}: no future-dated historical claims`);
    }
    assert.ok(event.eventDate <= event.verifiedAt);
    assert.ok(event.publishedAt <= event.verifiedAt);
    assert.ok(["historical", "not-reverified"].includes(event.legalStatus));
    const source = new URL(event.source.url);
    assert.equal(source.protocol, "https:");
    assert.match(source.hostname, /(^|\.)(fao\.org|un\.org|unctad\.org|pib\.gov\.in|pco\.gov\.ph)$/);
  }
});

test("empty filters return all records newest-first without mutating input", () => {
  const input = [...events].reverse();
  const before = input.map(event => event.id);
  const result = filterPolicyEvents(input);
  assert.equal(result.length, events.length);
  assert.deepEqual(input.map(event => event.id), before);
  assert.ok(result.every((event, i) => !i || result[i - 1].eventDate >= event.eventDate));
});

test("case-insensitive multilingual keyword search handles spaces and full-width input", () => {
  assert.deepEqual(filterPolicyEvents(events, {query: "  InDiA   rice  "}).map(event => event.id), ["in-white-rice-export-20230720"]);
  assert.equal(filterPolicyEvents(events, {query: "ＩＮＤＩＡ"}).length, 3);
  assert.equal(filterPolicyEvents(events, {query: "黑海"}).length, 3);
  assert.equal(filterPolicyEvents(events, {query: "棕榈油"}).length, 2);
  assert.equal(filterPolicyEvents(events, {query: "   "}).length, events.length);
});

test("country, type, commodity and keyword filters use AND semantics", () => {
  assert.deepEqual(filterPolicyEvents(events, {query: "India", country: "india", type: "export-restriction", commodity: "wheat"}).map(event => event.id), ["in-wheat-export-20220513"]);
  assert.equal(filterPolicyEvents(events, {country: "indonesia", commodity: "rice"}).length, 0);
  assert.equal(filterPolicyEvents(events, {query: "no-such-event"}).length, 0);
  assert.equal(filterPolicyEvents(events, {type: "not-a-type"}).length, 0);
  assert.equal(filterPolicyEvents([], {query: "rice"}).length, 0);
});

test("historical event and source publication dates are not conflated", () => {
  const ban = events.find(event => event.id === "id-palm-oil-ban-20220428");
  assert.equal(ban.eventDate, "2022-04-28");
  assert.equal(ban.publishedAt, "2022-05-27");
  assert.equal(ban.legalStatus, "historical");
  const report = events.find(event => event.id === "red-sea-shipping-assessment-20240222");
  assert.equal(report.effectiveDate, null);
  assert.match(report.summary.en, /not the conflict's onset/);
});

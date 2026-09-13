import test from "node:test";
import assert from "node:assert/strict";
import {cropWeatherAlerts,ALERT_REVIEWED} from "../src/data/cropWeatherAlerts.js";
import {alertSnapshot} from "../src/services/cropWeatherAlerts.js";
test("crop alerts retain bilingual evidence and official dated sources",()=>{
  assert.equal(new Set(cropWeatherAlerts.map(r=>r.id)).size,cropWeatherAlerts.length);
  for(const r of cropWeatherAlerts){
    assert.ok(["red","yellow"].includes(r.level));assert.equal(r.year,2026);
    assert.ok(r.source.date<=ALERT_REVIEWED);assert.equal(new URL(r.source.url).hostname,"joint-research-centre.ec.europa.eu");
    for(const field of ["region","crop","period","hazard","impact","evidence"]){assert.ok(r[field].zh);assert.ok(r[field].en);}
  }
});
test("attention filter counts report groups, not countries",()=>{
  const now=Date.parse("2026-09-13T12:00:00Z"),all=alertSnapshot(now);
  assert.equal(all.stale,false);assert.equal(all.red,3);assert.equal(all.yellow,4);
  assert.equal(alertSnapshot(now,"red").rows.length,3);assert.equal(alertSnapshot(now,"yellow").rows.length,4);
  assert.equal(alertSnapshot(now,"invalid").rows.length,0);
});
test("old reviews are archived and future years do not inherit old alerts",()=>{
  assert.equal(alertSnapshot(Date.parse("2026-10-14T00:00:00Z")).stale,true);
  assert.equal(alertSnapshot(Date.parse("2027-01-01T00:00:00Z")).rows.length,0);
  assert.equal(alertSnapshot(Date.parse("2026-08-01T00:00:00Z")).rows.length,0);
  assert.equal(alertSnapshot(NaN).stale,true);
});

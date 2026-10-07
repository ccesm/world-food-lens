// Source outages must never break the test suite that runs BEFORE the daily
// refresh. Regression tests use frozen fixtures; the few designated live-data
// checks below must accept every honest outage shape the pipeline can publish.
// Fixtures *-outage.json are the real release 9f5b585 (2026-10-07), when a
// gridMET retrieval failure made every Level C state unavailable.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {validSpatial,spatialHealth,selectSpatial,METRICS} from "../src/services/cornSpatial.js";
import {validateOfficialBundle} from "../src/services/officialSources.js";
import {validateDroughtBundle} from "../src/services/droughtMonitor.js";
import {publishableOutputs} from "../src/services/evidenceRegistry.js";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const json=path=>JSON.parse(read(path));
const registry=json("../src/data/evidenceRegistry.json");
const spatialOutage=json("./fixtures/corn-spatial-outage.json");
const heatOutage=json("./fixtures/corn-heat-screen-outage.json");

test("a real Level C outage release is a valid, honestly unavailable artifact",()=>{
  assert.equal(spatialOutage.combined.coverage,0);
  assert.ok(spatialOutage.states.every(s=>s.status==="unavailable"&&s.reasons.length>0));
  assert.ok(validSpatial(spatialOutage));
  const now=Date.parse(spatialOutage.generatedAt);
  const health=spatialHealth(spatialOutage,{now});
  for(const s of spatialOutage.states)
    assert.notEqual(selectSpatial(s,null,health,{now}).method,"mapped-corn-area-weighted",s.state);
  assert.deepEqual(spatialOutage.combined.weatherSummary,Object.fromEntries(METRICS.map(k=>[k,null])));
});

test("the heat screen published during that outage is bound to it and fully unavailable",()=>{
  assert.equal(heatOutage.baseArtifact.analysisHash,spatialOutage.analysisHash);
  assert.equal(heatOutage.combined.coverage,0);
  assert.equal(heatOutage.combined.unavailableStates.length,heatOutage.states.length);
  for(const s of heatOutage.states){
    assert.equal(s.status,"unavailable");
    assert.ok(Object.values(s.heatSummary).every(v=>v===null));
  }
  const allowed=publishableOutputs(registry);
  for(const key of Object.keys(heatOutage.states[0].heatSummary))assert.ok(allowed.has(key),key);
});

test("official-data outage shapes stay valid: retained data and first-ever failure",()=>{
  const baseline=json("./fixtures/official-data-baseline.json");
  const retained=structuredClone(baseline);
  for(const record of Object.values(retained.sources))record.status="error";
  assert.equal(validateOfficialBundle(retained),retained);
  const empty=structuredClone(baseline);
  for(const key of Object.keys(empty.sources))empty.sources[key]={status:"error",data:null};
  assert.equal(validateOfficialBundle(empty),empty);
});

test("a drought cache retained long after its last success is stale, not invalid",()=>{
  const baseline=json("./fixtures/drought-monitor-baseline.json");
  const later=Date.parse(baseline.fetchedAt)+400*86400000;
  const result=validateDroughtBundle(baseline,later);
  assert.ok(result);assert.equal(result.stale,true);
});

test("only designated live-data checks read the mutable public/data release",()=>{
  // Each entry must tolerate source outages (see the tests above). Everything
  // else uses tests/fixtures so a failed refresh can never block the next one.
  const allowed={
    "officialData.test.js":"schema check of the live official cache",
    "droughtMonitor.test.js":"schema check of the live drought cache",
    "localWeather.test.js":"live weather check; failed points must be error records",
    "evidenceRegistry.test.js":"published keys must have reviewed rules",
    "cornAlignment.test.js":"daily generator integration over the live caches",
    "sourceDesk.test.js":"recovered-snapshot.json is static migration data",
    "liveDataOutage.test.js":"this policy test",
    "test_release_pipeline.py":"synthetic temporary repositories only",
    "test_corn_spatial_operations.py":"comment explaining the frozen baseline",
    "contract_fixtures.py":"manual --all CLI, not a test",
  };
  const dir=new URL("./",import.meta.url);
  const offenders=readdirSync(dir).filter(n=>/\.(js|py)$/.test(n)&&!(n in allowed)&&read(`./${n}`).includes("public/data"));
  assert.deepEqual(offenders,[]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {validMetadata,normalizeMetadata} from "../src/services/dataContract.js";
import {datasetHealth,freshCheck,derivedProvenance,publicationState} from "../src/services/dataHealth.js";
import {sourceState} from "../src/services/officialSources.js";
import {evaluateAutomaticAlerts,validateMonitorBundle} from "../src/services/automaticAlerts.js";
import {validateAlertFeed} from "../src/services/alertFeed.js";
import {buildDataHealth} from "../src/services/centralDataHealth.js";
import {readFileSync} from "node:fs";
import {buildOfficialPriceForecast} from "../src/services/priceForecast.js";
const now=Date.parse("2026-10-04T12:00:00Z");
const rows=JSON.parse(execFileSync("python3",["tests/contract_fixtures.py"],{encoding:"utf8"}));

test("Python ingestion metadata is accepted by the JS contract without reinterpretation",()=>{
  for(const record of Object.values(rows)) {
    assert.equal(validMetadata(record.metadata),true);
    assert.deepEqual(normalizeMetadata(record,"fao"),record.metadata);
  }
  assert.equal(datasetHealth(rows.new,{key:"fao",now}).analysisUsable,true);
  assert.equal(datasetHealth(rows.unchanged,{key:"fao",now}).metadata.cache,"unchanged");
});
test("all migrated source metadata including RONI windows and shared weather/soil crosses languages",()=>{
  const migrated=JSON.parse(execFileSync("python3",["tests/contract_fixtures.py","--all"],{encoding:"utf8",maxBuffer:8*1024*1024}));
  for(const [key,record] of Object.entries(migrated)) {
    assert.equal(validMetadata(record.metadata),true,key);
    assert.deepEqual(normalizeMetadata(record,key),record.metadata,key);
  }
  assert.deepEqual(normalizeMetadata(migrated.weather,"soil"),migrated.weather.metadata);
});
test("Python and JavaScript reject the same malformed metadata combinations",()=>{
  const examples=[rows.new.metadata,null,{},true];
  for(const change of [m=>m.contractVersion=true,m=>m.contractVersion=1.0,m=>m.cache="unknown-value",
    m=>delete m.version,m=>m.accepted.fetchedAt="2026-02-30T00:00:00Z",m=>m.accepted.fetchedAt="0000-01-01T00:00:00Z",
    m=>{m.accepted.semantic="passed";m.accepted.format="unknown";},m=>m.attempt.retrieval="unknown"]) {
    const m=structuredClone(rows.new.metadata);change(m);examples.push(m);
  }
  const python=JSON.parse(execFileSync("python3",["-c",
    "import sys,json; sys.path.insert(0,'scripts'); from data_contract import valid_metadata; print(json.dumps([valid_metadata(x) for x in json.load(sys.stdin)]))"],
    {input:JSON.stringify(examples),encoding:"utf8"}));
  assert.deepEqual(examples.map(validMetadata),python);
});
test("valid retained data are displayable but a failed attempt cannot become current evidence",()=>{
  for(const key of ["offline","semantic","structural","regression"]) {
    const row=datasetHealth(rows[key],{key:"fao",now,eligible:true});
    assert.equal(row.displayUsable,true);assert.equal(row.analysisUsable,false);assert.equal(row.evidence.eligible,false);
    assert.equal(row.freshness,"current");assert.ok(row.reasons.includes("cached_after_failure"));
  }
  assert.equal(datasetHealth(rows.semantic,{key:"fao",now}).retrieval,"ok");
  assert.equal(datasetHealth(rows.offline,{key:"fao",now}).retrieval,"failed");
  assert.ok(datasetHealth(rows.regression,{key:"fao",now}).reasons.includes("publication_regression"));
});
test("healthy source and dataset can be rule-ineligible without a source failure",()=>{
  const row=datasetHealth(rows.new,{key:"fao",now,eligible:false,ruleId:"long-history"});
  assert.equal(row.validation,"passed");assert.equal(row.retrieval,"ok");assert.equal(row.analysisUsable,true);
  assert.deepEqual(row.reasons,[]);assert.deepEqual(row.evidence.reasons,["insufficient_evidence"]);
});
test("freshness is source-aware and unknown cadence remains unknown",()=>{
  assert.equal(publicationState("fao","2026-09",now),"current");
  assert.equal(publicationState("usda","2026-09",now),"awaiting");
  assert.equal(publicationState("soil","2026-09-30",now),"awaiting");
  assert.equal(publicationState("unregistered","2026-10",now),"unknown");
  assert.equal(datasetHealth(rows.new,{key:"fao",now:now+4*86400000}).freshness,"stale");
  assert.equal(freshCheck(rows.new,now+4*86400000),false);
});
test("invalid explicit contract or contradictory timestamps never use the legacy success adapter",()=>{
  for(const mutate of [r=>delete r.metadata.accepted,r=>r.metadata.attempt.retrieval="failed",
    r=>r.metadata.observation.period="2026-10",r=>r.metadata.contractVersion=true,
    r=>r.fetchedAt="2026-10-04T13:00:00Z",r=>r.metadata.datasetId="worldBank"]) {
    const r=structuredClone(rows.new);mutate(r);
    assert.equal(normalizeMetadata(r,"fao"),null);
    assert.equal(datasetHealth(r,{key:"fao",now,eligible:true}).analysisUsable,false);
  }
});
test("legacy records stay readable, with unknown version rather than fabricated identity",()=>{
  const record=structuredClone(rows.new);delete record.metadata;
  assert.equal(sourceState(record,now),"cached");
  const m=normalizeMetadata(record,"fao");assert.equal(m.cache,"legacy");assert.equal(m.version.contentHash,null);
  assert.equal(m.observation.publishedAt,null);
});
test("derived provenance names its method and exact accepted inputs",()=>{
  const p=derivedProvenance("monthly-change/v1",[rows.new],{now,eligible:true,release:"release-test"});
  assert.equal(p.inputs[0].contentHash,rows.new.metadata.version.contentHash);
  assert.equal(p.methodVersion,"monthly-change/v1");assert.equal(p.calculatedAt,new Date(now).toISOString());
  assert.equal(p.release,"release-test");
});

test("central snapshot and legacy health projection agree and are release-bound",()=>{
  const result=evaluateAutomaticAlerts({official:{sources:{fao:rows.new}},points:[],now});
  const central=result.dataHealth.datasets.find(r=>r.id==="fao"),wire=result.health.find(r=>r.id==="fao");
  for(const key of ["retrieval","validation","freshness","eligibility"])assert.equal(wire[key],central[key]);
  assert.equal(result.health.find(r=>r.id==="calendar").fetchedAt,undefined);
  assert.ok(validateMonitorBundle(result));assert.ok(validateAlertFeed(result,now));
  for(const mutate of [r=>r.dataHealth.release="unrelated",r=>r.dataHealth.datasets[0].reasons=["invented"],
    r=>r.dataHealth.datasets[0].evidence.eligible=true,r=>r.dataHealth.assessedAt="2000-01-01T00:00:00Z"]) {
    const bad=structuredClone(result);mutate(bad);
    assert.equal(validateMonitorBundle(bad),null);assert.equal(validateAlertFeed(bad,now),null);
  }
});
test("GDO parsing success with an unverified period never supplies automatic evidence",()=>{
  const drought=JSON.parse(readFileSync(new URL("../public/data/drought-monitor.json",import.meta.url)));
  drought.status="ok";drought.fetchedAt=new Date(now).toISOString();drought.periodVerified=false;
  const health=buildDataHealth({drought,now,evidence:{drought:new Set(["x"])}}).datasets.find(r=>r.id==="drought");
  assert.equal(health.retrieval,"ok");assert.equal(health.validation,"unverified");
  assert.equal(health.analysisUsable,false);assert.equal(health.evidence.eligible,false);
  assert.ok(health.reasons.includes("period_unverified"));
});
test("malformed point payloads yield unavailable health, not a crashed diagnostic collector",()=>{
  for(const days of [null,{},[null],[{date:"not-a-date"}]]) {
    const health=buildDataHealth({now,weather:{schemaVersion:1,points:{x:{status:"ok",days}}},points:[{id:"x",lat:0,lon:0}]});
    assert.equal(health.datasets.find(r=>r.id==="weather/x").analysisUsable,false);
  }
});
test("alert creation and resolution retain separate audited evaluation inputs",()=>{
  const official={schemaVersion:1,sources:{fao:rows.new}};
  const first=evaluateAutomaticAlerts({official,now});
  assert.equal(first.active.length,1);
  assert.equal(first.active[0].provenance.inputs[0].contentHash,rows.new.metadata.version.contentHash);
  assert.deepEqual(first.events[0].provenance,first.active[0].provenance);
  const failed=evaluateAutomaticAlerts({official:{schemaVersion:1,sources:{fao:rows.offline}},now:now+1000,previous:first});
  assert.equal(failed.active[0].state,"unverified");
  assert.deepEqual(failed.active[0].provenance,first.active[0].provenance);
  assert.equal(failed.events.at(-1).provenance.eligibility,"insufficient");
});
test("price model uses the same health gate and records its input version",()=>{
  const record=JSON.parse(readFileSync(new URL("../public/data/official-data.json",import.meta.url))).sources.fao;
  record.status="ok";record.fetchedAt=new Date(now).toISOString();
  const usable=buildOfficialPriceForecast(record,0,now);
  assert.equal(usable.available,true);assert.equal(usable.provenance.inputs[0].datasetId,"fao");
  const failed=buildOfficialPriceForecast({...record,status:"error",failureKind:"retrieval"},0,now);
  assert.equal(failed.available,false);assert.equal(failed.provenance.eligibility,"insufficient");
  assert.equal(buildOfficialPriceForecast(record,0,now+4*86400000).available,false);
});

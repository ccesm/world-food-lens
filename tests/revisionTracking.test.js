import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {evaluateAutomaticAlerts,validateMonitorBundle} from "../src/services/automaticAlerts.js";
import {validateAlertFeed} from "../src/services/alertFeed.js";
import {buildPhase2,digest,projectDataset,weeklySummary} from "../scripts/revision_tracking.mjs";
import {SIGNAL_REGISTRY} from "../scripts/signal_registry.mjs";
import {validPhase2} from "../src/services/changeSet.js";

const at="2026-09-20T12:00:00.000Z",clone=structuredClone;
function usda(vintage="2026-09",stock=30,year=2026) {
  const history=[year-1,year].map(y=>({year:`${y}/${y+1}`,production:110,consumption:100,endingStocks:stock,ratio:stock,countryAreaCount:2}));
  const coverage=Object.fromEntries(history.map(r=>[r.year,{basis:"contributors",count:2,chinaId:null,
    contributors:[{id:"usda-psd:A",name:"A",production:88,consumption:80,endingStocks:stock*.8},
      {id:"usda-psd:B",name:"B",production:22,consumption:20,endingStocks:stock*.2}]}]));
  const g={history,coverage,coverageAssessment:{state:"compared"},latestPeriod:`${year}/${year+1}`,releasePeriod:vintage,stockToUse:stock,priorStockToUse:stock};
  return {status:"ok",fetchedAt:at,source:{url:"https://apps.fas.usda.gov/psdonline/",unit:"1000 metric tons; ratio: %",period:g.latestPeriod},
    data:{...clone(g),grains:{wheat:clone(g),maize:clone(g),rice:clone(g)}}};
}
function fao(change=6,month="2026-08") {
  const d=new Date(`${month}-01`);d.setUTCMonth(d.getUTCMonth()-1);
  return {status:"ok",fetchedAt:at,source:{url:"https://www.fao.org/worldfoodsituation/foodpricesindex/en/",period:month,unit:"2014–2016 = 100"},
    data:{monthly:[{month:d.toISOString().slice(0,7),fao:100},{month,fao:100+change}],
      headline:{value:100+change,momPct:change,period:month,unit:"2014–2016 = 100"}}};
}
function run({sources={},enso=null,previous=null,time=at}={}) {
  const official={schemaVersion:1,sources},monitor=evaluateAutomaticAlerts({official,enso,previous,now:Date.parse(time)});
  monitor.release={id:`release-${digest([sources,enso,time,previous?.release??null])}`,sourceRevision:"a".repeat(40),inputsHash:"b".repeat(64)};
  monitor.dataHealth.release=monitor.release.id;
  for(const h of monitor.dataHealth.datasets)h.release=monitor.release.id;
  monitor.analysis=buildPhase2({official,enso,monitor,previous});
  assert.ok(validateMonitorBundle(monitor));assert.ok(validateAlertFeed(monitor,Date.parse(time)));
  return monitor;
}
const changes=(r,type)=>r.analysis.changeSet.changes.filter(c=>!type||c.type===type);

test("baseline is not a historical observation; successful fetch clocks are not revisions",()=>{
  const first=run({sources:{usda:usda(),fao:fao()}});
  assert.equal(changes(first,"baseline").length,2);assert.equal(changes(first,"new-observation").length,0);
  const record=fao();record.fetchedAt="2026-09-21T12:00:00.000Z";
  const next=run({sources:{usda:usda(),fao:record},previous:first,time:record.fetchedAt});
  assert.equal(changes(next).length,0);
  assert.equal(next.analysis.changeSet.datasets.find(d=>d.datasetId==="fao").status,"no-change");
  assert.equal(first.analysis.checkpoints.fao.version.projectionHash,next.analysis.checkpoints.fao.version.projectionHash);
});
test("new monthly observation and historical revision are distinct in one release",()=>{
  const first=run({sources:{fao:fao()}}),record=fao(7,"2026-09");
  record.fetchedAt="2026-10-04T12:00:00.000Z";
  const next=run({sources:{fao:record},previous:first,time:record.fetchedAt});
  assert.equal(changes(next,"new-observation").length,1);
  assert.equal(changes(next,"revision").length,1);
  assert.equal(changes(next,"revision")[0].observation.period,"2026-08");
});
test("new USDA vintage with unchanged numbers is explicit; vintage is not market year",()=>{
  const first=run({sources:{usda:usda("2026-08")}});
  const next=run({sources:{usda:usda()},previous:first});
  assert.equal(changes(next,"new-publication-vintage").length,1);
  assert.equal(changes(next,"revision").length,0);
  assert.equal(changes(next,"new-observation").length,0);
});
test("same-vintage revision includes country and derived ratio facts with exact input versions",()=>{
  const first=run({sources:{usda:usda()}}),next=run({sources:{usda:usda("2026-09",29)},previous:first});
  const revisions=changes(next,"revision"),ratio=revisions.find(c=>c.field==="ratio"&&c.observation.geography==="world");
  assert.equal(ratio.previous,30);assert.ok(Math.abs(ratio.current-29)<1e-10);assert.ok(Math.abs(ratio.absoluteDelta+1)<1e-10);
  assert.equal(ratio.method,"stock-to-use/v1");assert.equal(ratio.previousVersion.vintage,ratio.currentVersion.vintage);
  assert.notEqual(ratio.previousVersion.projectionHash,ratio.currentVersion.projectionHash);
  assert.ok(revisions.some(c=>c.observation.geography==="usda-psd:B"));
  const signals=next.analysis.signals.filter(s=>s.ruleId==="usda-endingStocks-revision");
  assert.equal(signals.length,3);assert.ok(signals.every(s=>s.eligible&&s.severity===null&&!s.notification&&s.inputs.length===2));
  assert.ok(signals.every(s=>s.observation.period==="2026/2027"));
});
test("older publication is quarantined and cannot replace accepted checkpoints or emit revision signals",()=>{
  const first=run({sources:{usda:usda()}}),next=run({sources:{usda:usda("2026-08",10)},previous:first});
  assert.deepEqual(next.analysis.checkpoints.usda,first.analysis.checkpoints.usda);
  assert.equal(next.analysis.changeSet.datasets[0].reason,"publication_regression");
  assert.equal(changes(next,"revision").length,0);
});
test("failed retrieval and invalid incoming values preserve last accepted data; health is not market fact",()=>{
  const first=run({sources:{fao:fao()}}),bad=fao(60);bad.status="error";bad.failureKind="retrieval";
  const failed=run({sources:{fao:bad},previous:first});
  assert.deepEqual(failed.analysis.checkpoints.fao,first.analysis.checkpoints.fao);
  assert.ok(changes(failed,"health-only").length);assert.equal(changes(failed,"revision").length,0);
  assert.equal(failed.analysis.signals.find(s=>s.id==="market/fao/fao").state,"unverified");
  bad.status="ok";bad.data.monthly[1].fao=-1;
  const invalid=run({sources:{fao:bad},previous:first});
  assert.deepEqual(invalid.analysis.checkpoints.fao,first.analysis.checkpoints.fao);
});
test("coverage failure retains baseline; accepted composition change is structural, not comparable revision",()=>{
  const first=run({sources:{usda:usda()}}),bad=usda();bad.status="error";bad.failureKind="validation";
  const failed=run({sources:{usda:bad},previous:first});
  assert.deepEqual(failed.analysis.checkpoints.usda,first.analysis.checkpoints.usda);
  const changed=usda("2026-09",29);
  for(const g of Object.values(changed.data.grains))for(const c of Object.values(g.coverage))c.contributors[1].id="usda-psd:C";
  const next=run({sources:{usda:changed},previous:first});
  assert.ok(changes(next,"structural-change").length);
  assert.equal(next.analysis.signals.filter(s=>s.ruleId.startsWith("usda-")).length,0);
  assert.ok(changes(next,"structural-change").every(c=>!c.eligible&&c.absoluteDelta===null));
});
test("unit changes are structural and never produce numerical delta claims",()=>{
  const first=run({sources:{fao:fao()}}),changed=fao(10);changed.source.unit="new base";
  const next=run({sources:{fao:changed},previous:first});
  assert.ok(changes(next,"structural-change").length);
  assert.equal(changes(next,"revision").length,0);
  assert.equal(next.analysis.signals.find(s=>s.id==="market/fao/fao").eligible,false);
});
test("one deterministic change set tracks several datasets; replay is identical and input objects unchanged",()=>{
  const first=run({sources:{usda:usda(),fao:fao()}}),sources={usda:usda("2026-09",29),fao:fao(11)},before=clone(sources);
  const next=run({sources,previous:first}),repeat=run({sources,previous:first});
  assert.deepEqual(next,repeat);assert.deepEqual(sources,before);
  assert.deepEqual(new Set(changes(next,"revision").map(c=>c.datasetId)),new Set(["usda","fao"]));
  for(const s of next.analysis.signals.filter(s=>s.eligible)) {
    assert.equal(s.releaseId,next.release.id);assert.ok(s.inputs.every(v=>/^[a-f0-9]{64}$/.test(v.projectionHash)));
  }
});
test("registry reuses alert lifecycle: inactive → active → escalated → de-escalated → resolved; evidence loss unverified",()=>{
  let prior=run({sources:{fao:fao(1)}});
  const signal=r=>r.analysis.signals.find(s=>s.id==="market/fao/fao");
  assert.equal(signal(prior).state,"inactive");
  for(const [n,state] of [[6,"active"],[11,"escalated"],[6,"active"],[1,"resolved"]]) {
    prior=run({sources:{fao:fao(n)},previous:prior});assert.equal(signal(prior).state,state);
    assert.equal(signal(prior).threshold.kind,"heuristic");assert.equal(signal(prior).threshold.validated,false);
  }
  prior=run({sources:{fao:fao(6)},previous:prior});
  const failed=run({sources:{},previous:prior});assert.equal(signal(failed).state,"unverified");
  assert.equal(signal(failed).calculation,null);assert.equal(signal(failed).severity,null);
  assert.ok(SIGNAL_REGISTRY.filter(r=>r.id.startsWith("usda-")).every(r=>r.threshold.kind==="factual"));
});
test("legacy unknown USDA contributor coverage cannot support new revision signals",()=>{
  const record=usda();for(const g of Object.values(record.data.grains))delete g.coverage;
  const first=run({sources:{usda:record}}),changed=usda("2026-09",29);
  for(const g of Object.values(changed.data.grains))delete g.coverage;
  const next=run({sources:{usda:changed},previous:first});
  assert.ok(next.analysis.signals.filter(s=>s.ruleId.startsWith("usda-")).every(s=>!s.eligible&&s.state==="unverified"));
});
test("ENSO issue vintage and same forecast-window probability revisions retain source evidence without strength inference",()=>{
  const enso=JSON.parse(readFileSync(new URL("../public/data/enso-outlook.json",import.meta.url)));
  enso.fetchedAt=at;enso.data.issuedAt="2026-09-10";
  const first=run({enso}),nextEnso=clone(enso);nextEnso.data.forecasts[0].elNino-=1;nextEnso.data.forecasts[0].neutral+=1;
  nextEnso.data.strengthEvidence={status:"not-reliably-extracted",sourceText:"A very strong event is unlikely"};
  const next=run({enso:nextEnso,previous:first});
  assert.ok(changes(next,"revision").some(c=>c.field==="elNino"));
  assert.ok(changes(next,"revision").some(c=>c.current?.sourceText==="A very strong event is unlikely"));
  assert.ok(!next.analysis.signals.some(s=>s.ruleId.includes("enso")));
});
test("checkpoint corruption fails closed, legacy feed remains accepted, cross-release metadata rejected",()=>{
  const prior=run({sources:{fao:fao()}}),bad=clone(prior);bad.analysis.checkpoints.fao.rows[Object.keys(bad.analysis.checkpoints.fao.rows)[0]].values.value=999;
  assert.throws(()=>run({sources:{fao:fao()},previous:bad}),/Invalid revision history/);
  assert.equal(validPhase2(prior.analysis,`release-${"c".repeat(64)}`,at),false);
  delete prior.analysis;assert.ok(validateMonitorBundle(prior));
});
test("weekly summary uses supplied evaluation time, exposes startup/pruning and does not duplicate continuing signals",()=>{
  const first=run({sources:{fao:fao()}}),next=run({sources:{fao:fao()},previous:first});
  assert.equal(next.analysis.journal.at(-1).signals.length,0);
  assert.equal(next.analysis.weekly.complete,false);
  const week=weeklySummary(next.analysis.journal,at,"2026-09-01T00:00:00.000Z");
  assert.equal(week.complete,true);
  assert.equal(weeklySummary(next.analysis.journal,at,"2026-09-01T00:00:00.000Z","2026-09-19T00:00:00.000Z").complete,false);
});
test("monthly rolling checkpoints are bounded and do not invent structural loss for expired scope",()=>{
  const official=JSON.parse(readFileSync(new URL("../public/data/official-data.json",import.meta.url)));
  const projection=projectDataset("worldBank",official.sources.worldBank);
  assert.equal(Object.keys(projection.rows).length,24*9);
  assert.ok(JSON.stringify(projection).length<50000);
});

test("a new marketing year is not a revision of last year's observation",()=>{
  const first=run({sources:{usda:usda()}}),next=run({sources:{usda:usda("2026-09",30,2027)},previous:first});
  assert.ok(changes(next,"new-observation").length);
  assert.ok(changes(next,"new-observation").every(c=>c.observation.period==="2027/2028"));
  assert.equal(changes(next,"revision").length,0);
});
test("old successful cache becoming stale changes health but cannot emit a fresh market signal",()=>{
  const first=run({sources:{fao:fao()}}),next=run({sources:{fao:fao()},previous:first,time:"2026-09-25T12:00:00.000Z"});
  assert.equal(changes(next,"revision").length,0);assert.ok(changes(next,"health-only").length);
  assert.equal(next.analysis.signals.find(s=>s.id==="market/fao/fao").state,"unverified");
});
test("128-release and 90-day pruning are explicit, deterministic, and retain accepted checkpoints",()=>{
  let prior=run({sources:{usda:usda()}});
  for(let i=1;i<=129;i++)prior=run({sources:{usda:usda()},previous:prior,time:new Date(Date.parse(at)+i*1000).toISOString()});
  assert.equal(prior.analysis.journal.length,128);assert.ok(prior.analysis.prunedThrough);assert.equal(prior.analysis.weekly.complete,false);
  const after=run({sources:{},previous:prior,time:"2027-01-01T12:00:00.000Z"});
  assert.equal(after.analysis.journal.length,1);assert.deepEqual(after.analysis.checkpoints,prior.analysis.checkpoints);
});
test("a zero previous value has no percentage delta; a tiny factual revision has no warning severity",()=>{
  const first=run({sources:{usda:usda("2026-09",0)}}),next=run({sources:{usda:usda("2026-09",.001)},previous:first});
  const signal=next.analysis.signals.find(s=>s.ruleId==="usda-endingStocks-revision");
  assert.equal(signal.calculation.percentDelta,null);assert.equal(signal.severity,null);assert.equal(signal.threshold.kind,"factual");
});

test("real Python coverage/vintage decisions and canonical hashes survive change and signal evaluation",()=>{
  const result=spawnSync("python3",["tests/revision_fixtures.py"],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);const records=JSON.parse(result.stdout);
  const first=run({sources:{usda:records.initial},time:"2026-10-03T12:00:00.000Z"});
  const next=run({sources:{usda:records.revised},previous:first,time:"2026-10-04T12:00:00.000Z"});
  const signals=next.analysis.signals.filter(s=>s.ruleId==="usda-production-revision");
  assert.ok(signals.length>0);assert.ok(signals.every(s=>s.eligible&&s.inputs.every(i=>i.contentHash&&i.revisionId)));
  for(const [key,reason] of [["missing","coverage_incomplete"],["older","publication_regression"]]) {
    const rejected=run({sources:{usda:records[key]},previous:first,time:"2026-10-04T12:00:00.000Z"});
    assert.equal(rejected.analysis.changeSet.datasets[0].reason,reason);
    assert.deepEqual(rejected.analysis.checkpoints.usda,first.analysis.checkpoints.usda);
    assert.ok(rejected.analysis.changeSet.unavailable.find(r=>r.datasetId==="usda").reasons.includes(reason));
    assert.equal(changes(rejected,"revision").length,0);
  }
});
test("new geography is structural even with a new marketing year; new schema fields are not observations",()=>{
  const first=run({sources:{usda:usda()}}),record=usda("2026-09",30,2027);
  for(const g of Object.values(record.data.grains))for(const c of Object.values(g.coverage))c.contributors[1].id="usda-psd:NEW";
  const next=run({sources:{usda:record},previous:first});
  assert.ok(changes(next,"structural-change").some(c=>c.observation?.geography==="usda-psd:NEW"));
  assert.ok(!changes(next,"new-observation").some(c=>c.observation?.geography==="usda-psd:NEW"));
});
test("future or still-open monthly observations do not replace the accepted checkpoint",()=>{
  const first=run({sources:{fao:fao()}}),next=run({sources:{fao:fao(7,"2026-09")},previous:first});
  assert.equal(next.analysis.changeSet.datasets.find(d=>d.datasetId==="fao").reason,"semantic_validation_failed");
  assert.deepEqual(next.analysis.checkpoints.fao,first.analysis.checkpoints.fao);
});
test("wire validation rejects malformed rows, health changes and signal lineage without throwing",()=>{
  const first=run({sources:{fao:fao()}}),input=fao();input.status="error";
  const feed=run({sources:{fao:input},previous:first});
  for(const damage of [
    a=>{a.changeSet.unavailable=[null];},a=>{a.changeSet.changes[0].current.reasons=null;},
    a=>{a.checkpoints.fao.rows[Object.keys(a.checkpoints.fao.rows)[0]]=null;},
    a=>{a.signals[0].inputs=[{}];},a=>{a.signals[0].evaluatedAt="tomorrow";},a=>{a.journal=[null];},
  ]) {
    const broken=clone(feed);damage(broken.analysis);
    assert.equal(validateMonitorBundle(broken),null);assert.equal(validateAlertFeed(broken,Date.parse(at)),null);
  }
});

test("a full source hash change outside the projection is not advertised as identical source content",()=>{
  const output=spawnSync("python3",["tests/contract_fixtures.py"],{encoding:"utf8"});
  assert.equal(output.status,0,output.stderr);const record=JSON.parse(output.stdout).new;
  const time="2026-10-04T12:00:00.000Z",first=run({sources:{fao:record},time});
  const changed=clone(record);changed.metadata.version.contentHash="c".repeat(64);
  const next=run({sources:{fao:changed},previous:first,time});
  assert.equal(next.analysis.changeSet.datasets.find(d=>d.datasetId==="fao").status,"outside-tracked-scope");
  assert.equal(changes(next,"revision").length,0);
});
test("large correction journals respect byte pruning without truncating current facts",()=>{
  const enso=JSON.parse(readFileSync(new URL("../public/data/enso-outlook.json",import.meta.url)));
  enso.fetchedAt=at;enso.data.issuedAt="2026-09-10";
  let prior=run({enso});
  for(let i=0;i<3;i++) {
    enso.data.strengthEvidence={status:"not-reliably-extracted",sourceText:"x".repeat(600000)+i};
    prior=run({enso:clone(enso),previous:prior});
  }
  assert.ok(Buffer.byteLength(JSON.stringify(prior.analysis.journal))<=2_000_000);
  assert.ok(prior.analysis.prunedThrough);assert.equal(prior.analysis.weekly.complete,false);
  assert.equal(changes(prior,"revision").find(c=>c.field==="strengthEvidence").current.sourceText.length,600001);
});

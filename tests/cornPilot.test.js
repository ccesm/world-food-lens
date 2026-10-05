import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {build} from "esbuild";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {config,validCornData,validCornBaseline} from "../src/services/cornData.js";
import {productionWeights,estimatedStage,cropStage,weatherWindow,conditionComparison,validCornArtifact} from "../src/services/cornExposure.js";
import {evaluateAutomaticAlerts} from "../src/services/automaticAlerts.js";
import {buildPhase2,digest} from "../scripts/revision_tracking.mjs";
import {buildCornPilot,cornSignals,CORN_SIGNALS} from "../scripts/corn_pilot.mjs";
import {validateAlertFeed} from "../src/services/alertFeed.js";
import {validPhase2} from "../src/services/changeSet.js";
import {datasetHealth} from "../src/services/dataHealth.js";

const at="2026-07-25T12:00:00.000Z",now=Date.parse(at),clone=structuredClone;
const response=spawnSync("python3",["tests/corn_fixtures.py"],{encoding:"utf8",maxBuffer:4e6});
assert.equal(response.status,0,response.stderr);
const original=JSON.parse(response.stdout);
function run(pilot=clone(original),previous=null,time=at) {
  const official={schemaVersion:1,sources:{},cornPilot:pilot},monitor=evaluateAutomaticAlerts({official,previous,now:Date.parse(time)});
  monitor.release={id:`release-${digest([official,time,previous?.release??null])}`,sourceRevision:"a".repeat(40),inputsHash:"b".repeat(64)};
  monitor.dataHealth.release=monitor.release.id;
  for(const row of monitor.dataHealth.datasets)row.release=monitor.release.id;
  monitor.analysis=buildPhase2({official,monitor,previous});
  assert.ok(validateAlertFeed(monitor,Date.parse(time)));
  return monitor;
}
const hot=(p,id)=>{p.weather[id].days.forEach(d=>{d.max=37;});p.weather[id].metadata.version.contentHash=digest(p.weather[id].days);};
const artifact=p=>run(p).analysis.cornPilot;
const ia=config.regions[0],wi=config.regions.at(-1);

test("new Python records validate in JS with canonical metadata, units and geographic identity",()=>{
  for(const key of ["cornProduction","cornProgress"])assert.ok(validCornData(key,original.sources[key],now),key);
  assert.ok(config.regions.every(r=>validCornBaseline(original.baselines[r.id],r)));
  const result=run();
  assert.ok(result.dataHealth.datasets.filter(r=>r.id.startsWith("corn")||r.id.startsWith("weather/corn-")).every(r=>r.analysisUsable));
  assert.equal(result.analysis.cornPilot.eligibility,"eligible");
});
test("national weights cover 81.16%, keep outside states, and never normalize missing regions",()=>{
  const p=clone(original.sources.cornProduction.data),w=productionWeights(p);
  assert.ok(Math.abs(w.covered-.8116118933648967)<1e-12);assert.equal(w.covered+w.uncovered,1);
  delete p.regions.IA;
  assert.equal(productionWeights(p),null);
  const r=clone(original);delete r.sources.cornProduction.data.regions.IA;
  assert.equal(artifact(r).exposure.heat,null);
});
test("changed production shares alter weights, not the national denominator",()=>{
  const p=clone(original.sources.cornProduction.data),old=productionWeights(p);
  p.regions.IA.production*=.9;
  assert.equal(productionWeights(p).weights.IA,old.weights.IA*.9);
});
test("estimated stages have explicit region/date boundaries",()=>{
  assert.equal(estimatedStage(ia,"2026-06-30"),"vegetative");
  assert.equal(estimatedStage(ia,"2026-07-01"),"silking");
  assert.equal(estimatedStage(wi,"2026-07-01"),"vegetative");
  assert.equal(estimatedStage(wi,"2026-07-15"),"silking");
  assert.equal(estimatedStage(ia,"2026-02-30"),null);
});
test("official cumulative progress qualifies, but is not invented as exact stage occupancy",()=>{
  const report=clone(original.sources.cornProgress.data),stage=cropStage(ia,"2026-07-21",report);
  assert.equal(stage.officialMajorityMilestone,"silking");assert.equal(stage.reproductiveRelevant,null);
  report.regions.IA.progress={silking:100,mature:100};
  assert.equal(cropStage(ia,"2026-07-21",report).reproductiveRelevant,false);
  report.regions.IA.progress={silking:100,mature:20};
  assert.equal(cropStage(ia,"2026-07-21",report).reproductiveRelevant,true);
  assert.equal(cropStage(ia,"2026-07-10",report).officialProgress,null);
  assert.equal(cropStage(ia,"2026-08-01",report).officialProgress,null);
});
test("normal window retains raw values, provenance and matched-calendar anomalies",()=>{
  const a=artifact(),r=a.regions[0];assert.equal(r.weather.maxAnomaly,0);assert.equal(r.weather.rainAnomaly,0);
  assert.equal(r.weather.heat,false);assert.equal(r.weather.moisture,false);assert.equal(a.exposure.heat,0);
  assert.equal(r.weather.days.length,7);assert.equal(r.weather.normal.samples,30);
  assert.ok(r.inputVersions.every(v=>v.contentHash&&v.projectionHash));
});
test("heat in a large-producing state counts more than a small state; simultaneous screens sum once",()=>{
  const high=clone(original),low=clone(original),both=clone(original);hot(high,"IA");hot(low,"WI");hot(both,"IA");hot(both,"WI");
  assert.ok(artifact(high).exposure.heat>artifact(low).exposure.heat);
  assert.ok(Math.abs(artifact(both).exposure.heat-artifact(high).exposure.heat-artifact(low).exposure.heat)<1e-12);
});
test("moisture screen requires both below-baseline rainfall and root wetness, not either alone",()=>{
  const p=clone(original);p.weather.IA.days.forEach(d=>{d.rain=0;});assert.equal(artifact(p).regions[0].weather.moisture,false);
  p.weather.IA.days.forEach(d=>{d.rootWetness=.1;});assert.equal(artifact(p).regions[0].weather.moisture,true);
});
test("three hot days are a stage-specific heuristic, not a yield outcome",()=>{
  const p=clone(original),r=p.weather.IA;
  r.days.slice(-2).forEach(d=>{d.max=35;});assert.equal(artifact(p).regions[0].weather.heat,false);
  r.days.at(-3).max=35;assert.equal(artifact(p).regions[0].weather.heat,true);
  const g=p.sources.cornProgress.data;g.regions.IA.progress={silking:100,mature:100};g.history.at(-1).regions=clone(g.regions);
  assert.equal(artifact(p).regions[0].weather.heat,false);
});
test("official maturity is not backcast into the earlier days of a weather window",()=>{
  const p=clone(original),report=p.sources.cornProgress.data;
  report.regions.IA.progress={silking:100,mature:100};
  const days=p.weather.IA.days;days.forEach(d=>{d.max=37;});
  const w=weatherWindow(days,p.baselines.IA.data,ia,"2026-07-21",cropStage(ia,"2026-07-21",report));
  assert.equal(w.relevantHeatDays,4); // July 15–18 precede the July 19 maturity endpoint.
  assert.equal(w.moisture,false);
});
test("missing or stale weather is unavailable, retains uncovered weight and cannot dilute other states",()=>{
  const p=clone(original);hot(p,"WI");delete p.weather.IA;
  const a=artifact(p);assert.equal(a.eligibility,"partial");assert.ok(a.coverage.missing>0);
  assert.equal(a.exposure.heat,productionWeights(original.sources.cornProduction.data).weights.WI);
  assert.equal(a.regions[0].weather,null);
  const stale=clone(original);stale.weather.IA.fetchedAt="2026-07-01T00:00:00Z";stale.weather.IA.metadata.accepted.fetchedAt=stale.weather.IA.fetchedAt;
  assert.equal(artifact(stale).regions[0].eligible,false);
});
test("all missing weather yields null exposure, not a safe zero; latest days must cover common window",()=>{
  const p=clone(original);p.weather={};assert.equal(artifact(p).exposure.heat,null);
  const q=clone(original);q.weather.IA.days.pop();q.weather.IA.metadata.observation.period=q.weather.IA.days.at(-1).date;
  assert.equal(artifact(q).regions[0].eligible,false);
});
test("fixed historical baseline does not expire on daily fetch clock; missing or wrong geometry disables analysis",()=>{
  const p=clone(original);p.baselines.IA.fetchedAt="2021-01-01T00:00:00Z";p.baselines.IA.metadata.accepted.fetchedAt=p.baselines.IA.fetchedAt;
  assert.equal(artifact(p).regions[0].eligible,true);
  p.baselines.IA.data.lat=0;assert.equal(artifact(p).regions[0].eligible,false);
  delete p.baselines.IA;assert.equal(artifact(p).regions[0].eligible,false);
});
test("February 29 has no 30-year matched sample and fails closed",()=>{
  assert.equal(weatherWindow([],original.baselines.IA.data,ia,"2024-02-29",{reproductiveRelevant:null}),null);
});
test("official condition detects deterioration, improvement, unchanged and missing previous week distinctly",()=>{
  const g=clone(original.sources.cornProgress.data);assert.equal(conditionComparison(g,"IA").direction,"deteriorated");
  assert.equal(conditionComparison(g,"IA").deltaPoints,-5);
  g.regions.IA.condition.good=70;assert.equal(conditionComparison(g,"IA").direction,"improved");
  g.regions.IA.condition.good=65;assert.equal(conditionComparison(g,"IA").direction,"unchanged");
  g.history=[];assert.equal(conditionComparison(g,"IA").deltaPoints,null);assert.equal(conditionComparison(null,"IA"),null);
});
test("official facts use Phase 2 baselines/revisions; repeated fetches do not create fresh observations",()=>{
  const first=run(),second=run(clone(original),first);
  assert.ok(first.analysis.changeSet.changes.some(c=>c.datasetId==="cornProgress"&&c.type==="baseline"));
  assert.equal(second.analysis.changeSet.changes.filter(c=>c.datasetId.startsWith("corn")).length,0);
  const p=clone(original);p.sources.cornProgress.data.regions.IA.condition.good-=1;p.sources.cornProgress.data.regions.IA.condition.fair+=1;
  p.sources.cornProgress.data.history.at(-1).regions=clone(p.sources.cornProgress.data.regions);
  const third=run(p,second);
  assert.equal(third.analysis.changeSet.changes.filter(c=>c.datasetId==="cornProgress"&&c.type==="revision").length,2);
});
test("new official report becomes new observations, not a revision of last week's crop",()=>{
  const first=run(),p=clone(original),g=p.sources.cornProgress;
  const next=clone(g.data.history.at(-1));next.weekEnding="2026-07-26";next.publishedDate="2026-07-27";
  Object.assign(g.data,next);g.data.history.push(next);g.source.period=next.weekEnding;
  g.metadata.observation.period=next.weekEnding;g.metadata.extensions.publicationDate=next.publishedDate;
  for(const group of [p.sources,p.weather])for(const record of Object.values(group)){
    record.fetchedAt=record.lastAttemptAt="2026-07-27T12:00:00Z";record.metadata.accepted.fetchedAt=record.fetchedAt;record.metadata.attempt.checkedAt=record.lastAttemptAt;
  }
  const nextRun=run(p,first,"2026-07-27T12:00:00.000Z");
  assert.ok(nextRun.analysis.changeSet.changes.some(c=>c.datasetId==="cornProgress"&&c.type==="new-observation"));
});
test("NASS same-year national yield and area corrections link to Phase 2 supply-revision facts",()=>{
  const first=run(),p=clone(original),data=p.sources.cornProduction.data;
  data.national.harvestedArea+=10;data.national.yield+=.1;
  data.national.production=data.national.harvestedArea*data.national.yield;
  const next=run(p,first),facts=next.analysis.cornPilot.supply.annualRevisions;
  assert.equal(facts.length,3);
  assert.ok(facts.every(c=>next.analysis.changeSet.changes.includes(c)));
  assert.ok(next.analysis.signals.some(s=>s.evidenceType==="supply_revision"&&s.observation.commodity==="maize-yield"));
});
test("pilot informational signals never enter active/email alerts and distinguish evidence types",()=>{
  const p=clone(original);hot(p,"IA");const r=run(p);
  const signals=r.analysis.signals.filter(s=>s.ruleId.startsWith("corn/"));
  assert.ok(signals.some(s=>s.evidenceType==="weather_exposure"));assert.ok(signals.some(s=>s.evidenceType==="official_crop_condition"));
  assert.ok(signals.every(s=>!s.notification&&s.severity===null));assert.ok(!r.active.some(s=>s.id.startsWith("corn/")));
  assert.ok(CORN_SIGNALS.every(s=>!s.notification));
});
test("supply revision uses existing Phase 2 IDs, exact versions and US maize only",()=>{
  const monitor=run(),c={id:"change-x",datasetId:"usda",type:"revision",eligible:true,field:"production",previous:100,current:95,
    absoluteDelta:-5,percentDelta:-5,observation:{commodity:"maize",geography:"usda-psd:US",period:"2026/2027"},previousVersion:{},currentVersion:{}};
  const usdaVersion={datasetId:"usda",contentHash:"a".repeat(64),projectionHash:"b".repeat(64)};
  const maize={latestPeriod:"2026/2027",releasePeriod:"2026-07",coverage:{"2026/2027":{
    contributors:[{id:"usda-psd:US",name:"United States",production:95,endingStocks:20}]}}};
  const official={cornPilot:clone(original),sources:{usda:{source:{unit:"1000 metric tons"},data:{grains:{maize}}}}};
  monitor.dataHealth.datasets.find(h=>h.id==="usda").analysisUsable=true;
  const args={official,monitor,changeSet:{changes:[c,{...c,observation:{...c.observation,geography:"world"}}]},checkpoints:{usda:{coverageVerified:true,version:usdaVersion}}};
  assert.deepEqual(buildCornPilot(args).supply.revisions,[]);
  const a=buildCornPilot({...args,previous:{analysis:{checkpoints:{usda:{coverageVerified:true}}}}});
  assert.deepEqual(a.supply.revisions,[c]);assert.equal(cornSignals(a).find(s=>s.evidenceType==="supply_revision").changeId,c.id);
});
test("future/misaligned reports and altered release identity fail closed",()=>{
  const p=clone(original);p.sources.cornProgress.data.publishedDate="2026-08-01";
  assert.equal(artifact(p).officialReport,null);
  const r=run();assert.equal(validCornArtifact(r.analysis.cornPilot,"release-other",at),false);
  const bad=clone(r.analysis);bad.cornPilot.exposure.heat=2;assert.equal(validPhase2(bad,r.release.id,at),false);
});
test("winter awaits weekly report without applying old official stage to a new season",()=>{
  const r=clone(original.sources.cornProgress);r.source.period="2026-11-29";r.metadata.observation.period=r.source.period;
  r.fetchedAt="2027-01-02T00:00:00Z";r.metadata.accepted.fetchedAt=r.fetchedAt;
  const health=datasetHealth(r,{key:"cornProgress",valid:true,now:Date.parse(r.fetchedAt)});
  assert.equal(health.freshness,"awaiting");
  assert.equal(cropStage(ia,"2027-05-01",{weekEnding:"2026-11-29",regions:{}}).officialProgress,null);
});
test("artifact and Phase 2 remain deterministic, input-bound and non-mutating",()=>{
  const before=JSON.stringify(original),one=run(),two=run();assert.deepEqual(one,two);assert.equal(JSON.stringify(original),before);
});
test("real NASA historical windows replay without training, hindsight crop progress or causal inference",()=>{
  const f=JSON.parse(readFileSync(new URL("./fixtures/corn-historical-weather.json",import.meta.url)));
  const results=f.cases.map(c=>weatherWindow(c.days,f.baseline,ia,c.end,cropStage(ia,c.end,null)));
  assert.equal(results[0].heat,true);assert.equal(results[0].moisture,true);assert.equal(results[0].heatDays,6);
  assert.equal(results[1].heat,false);assert.equal(results[1].moisture,false);
  assert.equal(results[2].heat,false);assert.equal(results[2].moisture,false);
  assert.ok(Math.abs(results[0].maxAnomaly-7.38819047619)<1e-8);
  assert.ok(f.cases.every(c=>/^[a-f0-9]{64}$/.test(c.rawHash)&&c.url.startsWith("https://power.larc.nasa.gov/")));
});
test("pilot cannot contaminate existing notification source-health rows",()=>{
  const weatherRecord=clone(original.weather.IA);delete weatherRecord.metadata;
  const args={points:[{id:"iowa",lat:42,lon:-93.5,crops:["us-corn"]}],weather:{schemaVersion:1,points:{iowa:weatherRecord}},now};
  const old=evaluateAutomaticAlerts(args),withPilot=evaluateAutomaticAlerts({...args,official:{schemaVersion:1,sources:{},cornPilot:clone(original)}});
  assert.deepEqual(withPilot.health,old.health);assert.deepEqual(withPilot.active,old.active);assert.deepEqual(withPilot.events,old.events);
});
test("quarantined official vintage cannot support exposure despite a fresh retrieval timestamp",()=>{
  const first=run(),p=clone(original),g=p.sources.cornProgress;
  const older=g.data.history[0];Object.assign(g.data,clone(older));g.data.history=[older];
  g.source.period=older.weekEnding;g.metadata.observation.period=older.weekEnding;g.metadata.extensions.publicationDate=older.publishedDate;
  const next=run(p,first);
  assert.equal(next.analysis.changeSet.datasets.find(d=>d.datasetId==="cornProgress").reason,"publication_regression");
  assert.equal(next.analysis.cornPilot.officialReport,null);
});
const output=await build({entryPoints:["src/components/USCornPilot.jsx"],bundle:true,write:false,platform:"node",format:"cjs",external:["react"],define:{"import.meta.env":"{}"},logLevel:"silent"});
const compiled={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
test("English/Chinese UI separates exposure, official evidence and supply without causal or loss claims",()=>{
  for(const lang of ["zh","en"]) {
    const html=renderToStaticMarkup(React.createElement(compiled.exports.CornPilotView,{lang,artifact:artifact(),archive:true}));
    for(const phrase of lang==="zh"?["不是全州天气覆盖率","不证明因果","日历估计","官方累计进度","历史发布","不重新归一"]:
      ["not state-wide weather coverage","not proof of causation","Calendar estimate","Official cumulative progress","Historical release","not renormalized"])
      assert.ok(html.includes(phrase),phrase);
    const missing=renderToStaticMarkup(React.createElement(compiled.exports.CornPilotView,{lang}));
    assert.ok(missing.includes(lang==="zh"?"不显示零暴露":"missing evidence is not zero exposure"));
  }
});

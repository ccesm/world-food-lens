import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync,existsSync,mkdtempSync,rmSync,writeFileSync,copyFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {build} from "esbuild";
import {createRequire} from "node:module";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {alignment,progressDistribution,nationalWeights,progressEditions,stageAsOf,buildAlignment,validAlignment} from "../src/services/cornAlignment.js";
import {config,cropStage,weatherWindow} from "../src/services/cornExposure.js";
import {buildPhase2,digest} from "../scripts/revision_tracking.mjs";
import {attachCornAlignment} from "../scripts/corn_alignment.mjs";
import {evaluateAutomaticAlerts} from "../src/services/automaticAlerts.js";
import {validateAlertFeed} from "../src/services/alertFeed.js";
import {compareAlignment} from "../scripts/evaluate_corn_alignment.mjs";
const clone=structuredClone,at="2026-07-25T12:00:00.000Z",end="2026-07-21",id=`release-${"a".repeat(64)}`;
const response=spawnSync("python3",["tests/corn_fixtures.py"],{encoding:"utf8",maxBuffer:4e6});
assert.equal(response.status,0,response.stderr);const fixture=JSON.parse(response.stdout),unit=alignment.units[0];
function changed(p,{hot=false,dry=false,progress={silking:80,dough:45,dented:10,mature:0}}={}) {
  for(const r of Object.values(p.weather)){r.days.forEach(d=>{if(hot)d.max=37;if(dry){d.rain=0;d.rootWetness=.1;}});r.metadata.version.contentHash=digest(r.days);}
  const g=p.sources.cornProgress;
  for(const d of [...g.data.history,g.data])for(const r of Object.values(d.regions))r.progress=clone(progress);
  g.metadata.version.contentHash=digest(g.data);return p;
}
const options=p=>({production:p.sources.cornProduction,progress:[p.sources.cornProgress],weather:p.weather,baselines:p.baselines,
  end,evaluatedAt:at,releaseId:id});
const artifact=(p=changed(clone(fixture)))=>buildAlignment(options(p));
function run(p=changed(clone(fixture)),previous=null,time=at) {
  const official={schemaVersion:1,sources:{},cornPilot:p},monitor=evaluateAutomaticAlerts({official,previous,now:Date.parse(time)});
  monitor.release={id:`release-${digest([official,time,previous?.release??null])}`,sourceRevision:"a".repeat(40),inputsHash:"b".repeat(64)};
  monitor.dataHealth.release=monitor.release.id;for(const r of monitor.dataHealth.datasets)r.release=monitor.release.id;
  monitor.analysis=buildPhase2({official,monitor,previous});const legacy=clone(monitor.analysis.cornPilot),alerts=clone(monitor.active);
  attachCornAlignment({official,monitor,previous});assert.deepEqual(monitor.analysis.cornPilot,legacy);assert.deepEqual(monitor.active,alerts);
  assert.ok(validateAlertFeed(monitor,Date.parse(time)));return monitor;
}
test("cumulative progress is not a set of mutually exclusive stage shares",()=>{
  const s=progressDistribution({silking:80,dough:45,dented:10});
  assert.deepEqual(s.cumulative,{silking:80,dough:45,dented:10});
  assert.ok(Math.abs(s.bands.find(b=>b.from==="silking").lower-.35)<1e-12);
  assert.ok(Math.abs(s.relevant.lower-.7)<1e-12);assert.equal(s.relevant.upper,.8);
  assert.equal(s.relevant.exact,false);
  const known=progressDistribution({silking:80,dough:45,dented:10,mature:5});
  assert.equal(known.relevant.lower,.75);assert.equal(known.relevant.upper,.75);
});
test("impossible, malformed and absent progress are withheld, never clipped or filled",()=>{
  for(const p of [null,{},[],{silking:50,dough:80},{silking:-1},{silking:101},{silking:45.5},{silking:"80"},{flowering:30}])assert.equal(progressDistribution(p),null);
  assert.equal(progressDistribution({planted:100}).informative,false);
  assert.deepEqual(progressDistribution({silking:0}).relevant,{lower:0,upper:0,exact:false});
  assert.deepEqual(progressDistribution({mature:100}).relevant,{lower:0,upper:0,exact:false});
  assert.equal(progressDistribution({silking:80}).relevant.lower,0);
});
test("publication-before-day hold excludes future and same-day progress, with a weekly transition",()=>{
  const e=progressEditions([changed(clone(fixture)).sources.cornProgress]);
  assert.equal(stageAsOf(e,"IA","2026-07-12").edition,null);
  assert.equal(stageAsOf(e,"IA","2026-07-13").edition,null);
  assert.equal(stageAsOf(e,"IA","2026-07-14").edition.weekEnding,"2026-07-12");
  assert.equal(stageAsOf(e,"IA","2026-07-20").edition.weekEnding,"2026-07-12");
  assert.equal(stageAsOf(e,"IA","2026-07-21").edition.weekEnding,"2026-07-19");
  assert.equal(stageAsOf(e,"IA","2026-07-27").status,"aligned-held-observation");
  assert.equal(stageAsOf(e,"IA","2026-07-28").status,"stale-stage-observation");
});
test("conflicting same-day editions are ambiguous; missing/inconsistent latest state is not replaced by an older state",()=>{
  const e=progressEditions([changed(clone(fixture)).sources.cornProgress]),other=clone(e.at(-1));other.data.rawHash="b".repeat(64);
  assert.equal(stageAsOf([...e,other],"IA",end).status,"ambiguous-publication");
  delete e.at(-1).data.regions.IA;
  assert.equal(stageAsOf(e,"IA",end).status,"missing-or-inconsistent-progress");
});
test("future publications and corrections cannot change an earlier daily stage or exposure",()=>{
  const p=changed(clone(fixture),{hot:true}),a=artifact(p),future=clone(p.sources.cornProgress.data.history.at(-1));
  future.weekEnding="2026-07-26";future.publishedDate="2026-07-27";future.rawHash="c".repeat(64);
  for(const r of Object.values(future.regions))r.progress={silking:100,mature:100};
  const e=progressEditions([p.sources.cornProgress]);
  assert.deepEqual(stageAsOf(e,"IA",end),stageAsOf([...e,{data:future,version:e.at(-1).version}],"IA",end));
  const record=clone(p.sources.cornProgress);record.data=future;record.source.period=future.weekEnding;
  record.metadata.observation.period=future.weekEnding;record.metadata.extensions.publicationDate=future.publishedDate;
  record.metadata.version.contentHash=digest(future);
  const b=buildAlignment({...options(p),progress:[p.sources.cornProgress,record],evaluatedAt:at});
  assert.deepEqual(a,b);
});
test("national production weights keep partial coverage, changed weights and absent states",()=>{
  const p=clone(fixture.sources.cornProduction.data),w=nationalWeights(p);
  assert.ok(Math.abs(w.covered-.8116118933648967)<1e-12);
  delete p.regions.IA;const partial=nationalWeights(p);
  assert.equal(partial.weights.IA,null);assert.ok(Math.abs(partial.covered-w.covered+w.weights.IA)<1e-12);
  p.regions.WI.production/=2;assert.equal(nationalWeights(p).weights.WI,w.weights.WI/2);
  p.regions.WI.production=p.national.production*2;assert.equal(nationalWeights(p),null);
  const older=changed(clone(fixture));older.sources.cornProduction.data.year="2024";
  assert.equal(artifact(older).coverage,null);
  const future=changed(clone(fixture));future.sources.cornProduction.data.publishedDate="2026-07-20";
  assert.equal(artifact(future).coverage,null);
  assert.throws(()=>buildAlignment({...options(fixture),end:"2026-07-26"}),/Invalid alignment/);
});
test("stable agricultural state units preserve legacy coordinates; no cities or event-selected sampling",()=>{
  assert.equal(alignment.units.length,10);assert.equal(new Set(alignment.units.map(u=>u.id)).size,10);
  for(const [i,u] of alignment.units.entries()){assert.equal(u.id,`US-${config.regions[i].id}/maize`);assert.equal(u.lat,config.regions[i].lat);assert.equal(u.lon,config.regions[i].lon);}
  assert.deepEqual(artifact(),artifact());
  const p=changed(clone(fixture));p.weather.IA.url=p.weather.IA.url.replace("latitude=42","latitude=43");
  assert.equal(artifact(p).regions[0].weatherCovered,false);
});
test("coverage diagnostics are separate and partial joint coverage never becomes 100%",()=>{
  const p=changed(clone(fixture)),a=artifact(p),w=a.regions[0].productionWeight;
  assert.equal(a.coverage.production,a.coverage.stage);assert.equal(a.coverage.stage,a.coverage.weather);assert.equal(a.coverage.weather,a.coverage.joint);
  assert.equal(a.sampleCount,10);assert.ok(a.coverage.joint<1);
  delete p.weather.IA;const b=artifact(p);
  assert.equal(b.coverage.stage,a.coverage.stage);assert.ok(Math.abs(b.coverage.joint-a.coverage.joint+w)<1e-12);
  assert.equal(b.sampleCount,9);assert.equal(b.regions[0].screen.heat,null);assert.equal(b.regions[0].exposure.heat,null);
  assert.equal(b.coverage.missingJoint,1-b.coverage.joint);
  p.sources.cornProgress.data.history.shift();p.sources.cornProgress.metadata.version.contentHash=digest(p.sources.cornProgress.data);
  const c=artifact(p);assert.equal(c.coverage.stage,0);assert.equal(c.coverage.joint,0);assert.equal(c.exposure.heat,null);
});
test("zero, partial, high and mixed cumulative progress produce bounded stage proxies, not state-wide crop damage",()=>{
  const build=progress=>artifact(changed(clone(fixture),{hot:true,dry:true,progress}));
  const zero=build({silking:0});assert.equal(zero.exposure.heat.upper,0);assert.equal(zero.exposure.moisture.upper,0);
  const partial=build({silking:40,mature:10}),high=build({silking:100,mature:0});
  assert.ok(Math.abs(partial.exposure.heat.lower-partial.coverage.joint*.3)<1e-12);
  assert.equal(high.exposure.heat.lower,high.coverage.joint);assert.equal(high.exposure.moisture.upper,high.coverage.joint);
  const mixed=build({silking:80,dough:45,dented:10});assert.ok(mixed.exposure.heat.lower<mixed.exposure.heat.upper);
  const uncertain=build({silking:80});assert.equal(uncertain.regions[0].screen.heat,null);assert.equal(uncertain.exposure.heat.lower,0);
  assert.ok(Math.abs(uncertain.exposure.heat.upper-uncertain.coverage.joint*.8)<1e-12);
});
test("missing weather days and mismatched baselines exclude the unit rather than zero its exposure",()=>{
  const p=changed(clone(fixture),{hot:true});p.weather.IA.days.pop();assert.equal(artifact(p).regions[0].joint,false);
  p.baselines.IL.data.lat+=1;assert.equal(artifact(p).regions[1].joint,false);
});
test("the existing absolute heat and joint rain/root percentile rules remain unchanged",()=>{
  const p=changed(clone(fixture),{progress:{silking:100,mature:0}});
  for(const n of [2,3,7]) {
    p.weather.IA.days.forEach(d=>{d.max=30;});p.weather.IA.days.slice(-n).forEach(d=>{d.max=35;});
    const a=artifact(p).regions[0],r=config.regions[0];
    const old=weatherWindow(p.weather.IA.days,p.baselines.IA.data,r,end,cropStage(r,end,p.sources.cornProgress.data));
    assert.equal(a.screen.heat,old.heat);
  }
  p.weather.IA.days.forEach(d=>{d.rain=0;});assert.equal(artifact(p).regions[0].screen.moisture,false);
  p.weather.IA.days.forEach(d=>{d.rootWetness=.1;});assert.equal(artifact(p).regions[0].screen.moisture,true);
});
test("every artifact and unit retains methodology, weight, progress, weather and baseline versions",()=>{
  const a=artifact();assert.ok(validAlignment(a,id,at));
  assert.equal(a.methodVersion,alignment.methodVersion);assert.equal(a.productionVersion.datasetId,"cornProduction");
  assert.equal(a.provenance.release,id);assert.equal(a.provenance.methodVersion,alignment.methodVersion);
  for(const r of a.regions){assert.ok(r.inputVersions.some(v=>v.datasetId==="cornProduction"));assert.ok(r.inputVersions.some(v=>v.datasetId==="cornProgress"));assert.ok(r.inputVersions.some(v=>v.datasetId===`weather/corn-${r.state}`));assert.ok(r.inputVersions.every(v=>v.contentHash));}
  for(const mutate of [b=>b.regions[0].daily[0].edition.publishedDate=b.period.end,b=>b.coverage.joint=1,b=>b.methodVersion="legacy",
    b=>b.regions[0].daily[0].stage.relevant.upper=1,b=>b.exposure.heat.upper=.5,b=>b.provenance.inputs[0]=null,
    b=>b.regions[0].daily[0]=null,b=>b.productionVersion=null]){const b=clone(a);mutate(b);assert.equal(validAlignment(b,id,at),false);}
});
test("additive Phase 1/2 integration preserves legacy output, alert behavior and journal integrity",()=>{
  const first=run(),second=run(changed(clone(fixture)),first,"2026-07-25T13:00:00.000Z");
  assert.equal(first.analysis.changeSet.changes.filter(c=>c.datasetId==="cornAlignment").length,1);
  assert.equal(second.analysis.changeSet.changes.filter(c=>c.datasetId==="cornAlignment").length,0);
  const p=changed(clone(fixture));delete p.weather.IA;
  const third=run(p,second,"2026-07-25T14:00:00.000Z");
  assert.equal(third.analysis.changeSet.changes.filter(c=>c.datasetId==="cornAlignment"&&c.type==="structural-change").length,1);
  const {integrity,...body}=third.analysis;assert.equal(integrity,digest(body));
});
test("daily generator attaches the new artifact and configuration identity without writing live caches or sending email",()=>{
  const directory=mkdtempSync(join(tmpdir(),"wfl-alignment-test-"));
  try {
    for(const file of ["official-data.json","local-weather.json","drought-monitor.json","enso-outlook.json","monitor-alerts.json","alert-delivery.json"])
      if(existsSync(`public/data/${file}`))copyFileSync(`public/data/${file}`,join(directory,file));
    const previous=JSON.parse(readFileSync(join(directory,"monitor-alerts.json")));
    const p=changed(clone(fixture)),empty=join(directory,"synthetic");
    // A separate synthetic input cache makes the expected July period exact.
    writeFileSync(join(directory,"official-data.json"),JSON.stringify({schemaVersion:1,sources:{},cornPilot:p}));
    const r=spawnSync(process.execPath,["scripts/evaluate_alerts.mjs","--data-dir",directory,"--output",empty,"--now",at],{encoding:"utf8"});
    assert.equal(r.status,0,r.stderr);const feed=JSON.parse(readFileSync(empty));
    assert.ok(validateAlertFeed(feed,Date.parse(at)));assert.ok(feed.analysis.cornAlignment.coverage.joint>0);
    assert.deepEqual(JSON.parse(readFileSync(join(directory,"monitor-alerts.json"))),previous);
    assert.equal(feed.analysis.cornAlignment.releaseId,feed.release.id);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test("failed or retained canonical source eligibility cannot become an aligned numeric exposure",()=>{
  const p=changed(clone(fixture));p.weather.IA.status="error";p.weather.IA.metadata.cache="retained-retrieval";
  assert.equal(artifact(p).regions[0].joint,false);
  const a=buildAlignment({...options(changed(clone(fixture))),usable:()=>false});
  assert.equal(a.coverage,null);assert.equal(a.exposure.heat,null);assert.equal(a.eligibility,"unavailable");
});
test("Chinese and English UI visibly distinguish screening from confirmed agricultural impact",async()=>{
  const output=await build({entryPoints:["src/components/CornAlignment.jsx"],bundle:true,platform:"node",format:"cjs",write:false,external:["react"]});
  const module={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  for(const lang of ["zh","en"]){const html=renderToStaticMarkup(React.createElement(module.exports.CornAlignmentView,{artifact:artifact(),lang}));
    assert.match(html,lang==="zh"?/州级代表点筛查/:/state-level representative screening/);
    assert.match(html,lang==="zh"?/不是受灾面积/:/not affected acreage/);
    assert.match(html,lang==="zh"?/不使用未来报告/:/no future reports/);
    assert.match(html,lang==="zh"?/累计已达到/:/cumulative attainment/);
  }
});
test("frozen legacy source hashes and saved Phase 4A artifact remain unchanged",()=>{
  const legacy=JSON.parse(readFileSync("src/data/cornHistory.json"));
  for(const [path,expected] of Object.entries(legacy.replay.sourceFiles))assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),expected,path);
});
test("2012–2019 diagnostic replay is deterministic, input-bound and contains no outcomes or performance optimization",()=>{
  if(!existsSync("research/corn-history-inputs.json"))return;
  const input=JSON.parse(readFileSync("research/corn-history-inputs.json")),legacy=JSON.parse(readFileSync("src/data/cornHistory.json"));
  const a=compareAlignment(input,legacy),b=compareAlignment(input,legacy);assert.deepEqual(a,b);
  assert.equal(a.seasons.length,8);assert.ok(a.summary.weeklyWindows>270);
  assert.equal(a.summary.changedBecauseSpatialCoverage,0);
  assert.equal(a.summary.changedBecauseStageInterpretation,129);
  assert.equal(a.summary.changedBecauseTemporalAlignment,0);
  assert.equal(a.summary.classificationChanged,a.summary.changedBecauseStageOrTime);
  assert.ok(a.seasons.every(s=>s.weightYear===String(s.season-1)));
  for(const k of ["accuracy","outcome","correlation","thresholdComparison"])assert.equal(Object.hasOwn(a,k)||Object.hasOwn(a.summary,k),false);
  assert.throws(()=>compareAlignment({...input,seasons:[2020]},legacy));
});
test("diagnostic command cannot overwrite legacy artifact or historical input",()=>{
  const r=spawnSync(process.execPath,["scripts/evaluate_corn_alignment.mjs","research/corn-history-inputs.json","src/data/cornHistory.json"],{encoding:"utf8"});
  assert.notEqual(r.status,0);assert.match(r.stderr,/Refusing to overwrite/);
});

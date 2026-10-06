import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {build} from "esbuild";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {replaySeason,asOfOfficial,heatDiagnostics,correlation,evaluateHistory} from "../scripts/corn_history.mjs";
import {config,cropStage,weatherWindow} from "../src/services/cornExposure.js";
import {validCornHistory} from "../src/services/cornHistory.js";
const response=spawnSync("python3",["tests/corn_fixtures.py"],{encoding:"utf8",maxBuffer:4e6});
assert.equal(response.status,0,response.stderr);
const fixture=JSON.parse(response.stdout),clone=structuredClone;
function inputs() {
  const p=clone(fixture),annual=p.sources.cornProduction;
  annual.metadata.extensions.historyKind="published-report-vintage";annual.metadata.extensions.archiveKind="annual";
  const progress=p.sources.cornProgress.data.history.map(d=>{
    const r=clone(p.sources.cornProgress);r.data=d;r.source.period=d.weekEnding;r.metadata.observation.period=d.weekEnding;
    r.metadata.extensions={...r.metadata.extensions,publicationDate:d.publishedDate,historyKind:"published-report-vintage",archiveKind:"progress"};
    return r;
  });
  return {schemaVersion:1,protocol:"corn-history/1",seasons:[2026],annual:[annual],progress,supply:[],weather:p.weather,baselines:p.baselines,spatial:{},errors:[]};
}
const find=(s,end="2026-07-19")=>s.timeline.find(w=>w.end===end);
test("historical replay is deterministic and does not mutate inputs",()=>{
  const input=inputs(),before=clone(input);
  assert.deepEqual(evaluateHistory(input),evaluateHistory(input));assert.deepEqual(input,before);
});
test("future weather and official reports cannot change an earlier exposure",()=>{
  const a=inputs(),before=find(replaySeason(a,2026));
  a.weather.IA.days.push({date:"2026-07-26",max:50,min:20,rain:0,rootWetness:0});
  const future=clone(a.progress.at(-1));future.data.weekEnding="2026-07-26";future.data.publishedDate="2026-07-27";
  future.source.period=future.data.weekEnding;future.metadata.observation.period=future.data.weekEnding;future.metadata.extensions.publicationDate=future.data.publishedDate;
  future.data.regions.IA.progress={mature:100};a.progress.push(future);
  assert.deepEqual(find(replaySeason(a,2026)),before);
});
test("late publication and future vintages cannot enter as-of official selection",()=>{
  const a=inputs(),earlier=asOfOfficial(a.progress,"2026-07-20",{weekEnding:"2026-07-19"});
  assert.equal(earlier.data.weekEnding,"2026-07-12"); // day-only release on July 20 is not yet safely known
  assert.equal(asOfOfficial(a.progress,"2026-07-21",{weekEnding:"2026-07-19"}).data.weekEnding,"2026-07-19");
  a.progress.at(-1).data.publishedDate="2026-08-01";a.progress.at(-1).metadata.extensions.publicationDate="2026-08-01";
  assert.equal(asOfOfficial(a.progress,"2026-07-23",{weekEnding:"2026-07-19"}).data.weekEnding,"2026-07-12");
});
test("same-day conflicting editions remain ambiguous",()=>{
  const a=inputs(),r=clone(a.progress.at(-1));r.metadata.version.contentHash="e".repeat(64);a.progress.push(r);
  assert.equal(asOfOfficial(a.progress,"2026-07-23",{weekEnding:"2026-07-19"}),null);
});
test("official metadata cannot disagree with publication vintage or observation identity",()=>{
  for(const field of ["vintage","period"]){const a=inputs();a.progress.at(-1).metadata.observation[field]="2000-01";
    assert.equal(asOfOfficial(a.progress,"2026-07-23",{weekEnding:"2026-07-19"}).data.weekEnding,"2026-07-12");}
});
test("future final-year production cannot replace prior-year weights",()=>{
  const a=inputs(),before=find(replaySeason(a,2026));
  const later=clone(a.annual[0]);later.data.year="2026";later.data.publishedDate="2027-01-12";
  later.source.period="2026";later.metadata.observation.period="2026";later.metadata.observation.vintage="2027-01";
  later.metadata.extensions.publicationDate="2027-01-12";later.fetchedAt="2027-01-13T00:00:00Z";a.annual.push(later);
  assert.deepEqual(find(replaySeason(a,2026)),before);
});
test("conflicting same-day supply editions are excluded from outcome estimates",()=>{
  const a=inputs(),year=+a.annual[0].data.year;
  assert.equal(replaySeason(a,year).supplyTimeline.length,1);
  const conflicting=clone(a.annual[0]);conflicting.metadata.version.contentHash="f".repeat(64);a.annual.push(conflicting);
  const s=replaySeason(a,year);assert.equal(s.supplyTimeline.length,0);assert.equal(s.outcome.revision,null);
});
test("historical stages use actual dates and unchanged live weather calculation",()=>{
  const a=inputs(),s=replaySeason(a,2026),row=find(s).regions[0],region=config.regions[0];
  assert.equal(row.stage.estimated,"silking");
  const expected=weatherWindow(a.weather.IA.days,a.baselines.IA.data,region,"2026-07-19",row.stage);
  assert.equal(row.weather.heat,expected.heat);assert.equal(row.weather.rainAnomaly,expected.rainAnomaly);
  assert.equal(find(s,"2026-06-28").regions[0].stage.estimated,"vegetative");
});
test("synthetic normal and heat/moisture stress preserve original method",()=>{
  const a=inputs();assert.equal(find(replaySeason(a,2026)).union,0);
  a.weather.IA.days.forEach(d=>{d.max=38;d.rain=0;d.rootWetness=.1;});
  const row=find(replaySeason(a,2026));assert.ok(row.heat>0);assert.equal(row.heat,row.moisture);assert.equal(row.union,row.heat);
});
test("missing historical weather is uncovered, not zero or renormalized",()=>{
  const a=inputs(),before=find(replaySeason(a,2026));delete a.weather.IA;
  const after=find(replaySeason(a,2026));assert.equal(after.regions[0].weather,null);assert.ok(after.coverage.missing>0);
  assert.equal(after.regions[1].weight,before.regions[1].weight);
  a.weather={};const missing=find(replaySeason(a,2026));assert.equal(missing.heat,null);assert.equal(missing.union,null);
});
test("a gap inside a required seven-day historical window cannot be interpolated",()=>{
  const a=inputs();a.weather.IA.days=a.weather.IA.days.filter(d=>d.date!=="2026-07-17");
  assert.equal(find(replaySeason(a,2026)).regions[0].eligible,false);
});
test("retrospective and unavailable point-in-time modes cannot be interchanged",()=>{
  const a=inputs(),ret=replaySeason(a,2026),pit=replaySeason(a,2026,{mode:"point-in-time"});
  assert.equal(ret.validationMode,"retrospective");assert.equal(pit.eligibility,"unavailable");assert.deepEqual(pit.timeline,[]);
  assert.throws(()=>replaySeason(a,2026,{mode:"forecast"}));
});
test("historical provenance identifies every stage/weather/weight input",()=>{
  const s=replaySeason(inputs(),2026);
  assert.equal(s.methodologyVersion,config.methodVersion);
  for(const r of find(s).regions)for(const ref of r.inputs)assert.match(s.inputVersions[ref].contentHash,/^[a-f0-9]{64}$/);
});
test("outcome comparisons use exact lags; missing outcome is not a false positive",()=>{
  const a=inputs();
  for(const record of Object.values(a.weather))record.days.unshift(...["2026-07-06","2026-07-07"].map(date=>({...record.days[0],date})));
  const s=replaySeason(a,2026);
  assert.equal(s.comparisons[1].pairs,10);assert.equal(s.comparisons[1].falseNegativeLike,10);
  assert.equal(s.comparisons[2].pairs,0);assert.equal(s.comparisons[2].falsePositiveLikeFraction,null);
});
test("threshold experiments leave production inputs and the live heat screen unchanged",()=>{
  const a=inputs(),r=config.regions[0];a.weather.IA.days.forEach(d=>{d.max=34;});
  const stage=cropStage(r,"2026-07-19",null),days=a.weather.IA.days,b=a.baselines.IA.data,before=clone(days);
  const wx=weatherWindow(days,b,r,"2026-07-19",stage),d=heatDiagnostics(days,b,r,"2026-07-19",stage,wx);
  assert.equal(d.heat33,true);assert.equal(d.heat35,false);assert.equal(d.heat37,false);assert.equal(wx.heat,false);assert.deepEqual(days,before);
});
test("correlations omit missing outcomes and handle ties, constants and tiny samples",()=>{
  assert.equal(correlation([[1,2],[2,4],[3,6],[null,7]]).pearson,1);
  assert.equal(correlation([[1,2],[1,2],[3,6]]).spearman,1);
  assert.equal(correlation([[1,2],[1,3],[1,4]]).pearson,null);
  assert.equal(correlation([[1,2],[2,4]]).pearson,null);
});
const actual=JSON.parse(readFileSync("src/data/cornHistory.json","utf8"));
test("saved historical artifact is bound to the exact frozen inputs and replay code",()=>{
  const hash=raw=>createHash("sha256").update(raw).digest("hex");
  assert.equal(actual.replay.inputBytesSha256,hash(readFileSync("research/corn-history-inputs.json")));
  for(const [path,expected] of Object.entries(actual.replay.sourceFiles))assert.equal(hash(readFileSync(path)),expected,path);
});
test("actual artifact covers all eight contiguous seasons, with unavailable true PIT",()=>{
  assert.ok(validCornHistory(actual));assert.deepEqual(actual.seasons.map(s=>s.season),[2012,2013,2014,2015,2016,2017,2018,2019]);
  assert.equal(actual.seasons.reduce((n,s)=>n+s.stats.completeWeeks,0),278);
  assert.ok(actual.seasons[0].stats.maxExposure>actual.seasons.at(-1).stats.maxExposure);
});
test("malformed or relabeled research output is rejected rather than called real time",()=>{
  for(const mutate of [a=>a.validationMode="point-in-time",a=>a.inputHash="bad",a=>a.seasons[0].timeline[0].union=2,
    a=>a.seasons[0].inputVersions[Object.keys(a.seasons[0].inputVersions)[0]].downloadUrl="javascript:alert(1)"]){
    const a=clone(actual);mutate(a);assert.equal(validCornHistory(a),false);
  }
  assert.equal(validCornHistory(null),false);
});
const output=await build({entryPoints:["src/components/CornHistory.jsx"],bundle:true,write:false,platform:"node",format:"cjs",external:["react"],logLevel:"silent"});
const compiled={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
test("bilingual research UI clearly labels retrospective, missing PIT and noncausal outcomes",()=>{
  for(const lang of ["zh","en"]) {
    const html=renderToStaticMarkup(React.createElement(compiled.exports.CornHistoryView,{lang,data:actual}));
    for(const phrase of lang==="zh"?["回顾性分析","不是当时实时重建","不是因果证明","不是最新最终值","不改线上规则"]:
      ["Retrospective analysis","not a point-in-time reconstruction","neither causal proof","not the latest final value","live rules unchanged"])assert.ok(html.includes(phrase),phrase);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validSpatial,selectSpatial,spatialHealth,SPATIAL_METHOD} from "../src/services/cornSpatial.js";
import {config} from "../src/services/cornData.js";
import {validHealthSnapshot} from "../src/services/dataHealth.js";
import {attachCornSpatial} from "../scripts/corn_spatial.mjs";
import {evaluateAutomaticAlerts} from "../src/services/automaticAlerts.js";
import {buildPhase2,digest} from "../scripts/revision_tracking.mjs";
import {attachCornAlignment} from "../scripts/corn_alignment.mjs";
import {readFile} from "node:fs/promises";

const at="2026-10-05T12:00:00.000Z",now=Date.parse(at),period={start:"2026-09-20",end:"2026-10-03"};
const metrics=["tmaxDailyMeanC","tmaxPeriodMaximumC","tminDailyMeanC","tminPeriodMinimumC","precipitation14DayMm"];
const h="a".repeat(64),grid="cornbelt-iowa-anchored-9km/1";
const summary=()=>Object.fromEntries(metrics.map(k=>[k,{mean:20,min:10,p10:12,p50:20,p90:25,max:30}]));
const sourceVersions=()=>Object.fromEntries(["tmmx","tmmn","pr"].map(k=>[k,[{contentHash:h,rawFileHash:h,
  expectedDates:Array.from({length:14},(_,i)=>new Date(Date.parse(period.start)+i*86400000).toISOString().slice(0,10)),missingDates:[]}]]));
const record=(key,id,data,failed=false)=>({status:failed?"error":"ok",fetchedAt:failed?null:at,lastAttemptAt:at,
  source:{period:key==="cornSpatialCrop"?"2023":period.end},data,
  metadata:{contractVersion:1,datasetId:`${key}/${id}`,provider:"test",sourceUrl:"https://example.org",downloadUrl:null,
    observation:{period:key==="cornSpatialCrop"?"2023":period.end,marketYear:null,vintage:null,publishedAt:null},
    attempt:{checkedAt:at,retrieval:failed?"failed":"ok",format:failed?"unknown":"passed",semantic:failed?"unknown":"passed",reason:failed?"retrieval_failed":null},
    accepted:{fetchedAt:failed?null:at,format:failed?"unknown":"passed",semantic:failed?"unknown":"passed",period:"verified"},
    cache:failed?"unavailable":"new",version:{contentHash:failed?null:h,observationId:null,revisionId:null},extensions:{}}});

export function fixture() {
  const states=config.regions.map(r=>{
    const s={state:r.id,status:"ok",spatialMethod:"mapped-corn-area-weighted",methodVersion:SPATIAL_METHOD,gridVersion:grid,
      localStageEligibility:"insufficient",period,mappedCornAreaM2:100,validWeatherAreaM2:100,coverage:1,missingAreaM2:0,reasons:[],
      annualKey:h,cropGeographyYear:2023,cropGeographyPublicationDate:"2024-01-30",geographyUse:"validated-older-geography-proxy",weatherVersions:sourceVersions(),weatherSummary:summary()};
    s.records={crop:record("cornSpatialCrop",r.id,{mappedCornAreaM2:100}),weather:record("cornSpatialWeather",r.id,{}),
      intersection:record("cornSpatial",r.id,{annualKey:h,mappedCornAreaM2:100,validWeatherAreaM2:100,period,weatherSummary:s.weatherSummary})};
    return s;
  });
  return {schemaVersion:1,methodVersion:SPATIAL_METHOD,gridVersion:grid,generatedAt:at,period,analysisHash:h,states,
    combined:{scope:"ten-state-corn-belt-only",spatialMethod:"mapped-corn-area-weighted",methodVersion:SPATIAL_METHOD,gridVersion:grid,
      localStageEligibility:"insufficient",period,knownMappedCornAreaM2:1000,mappedCornAreaM2:1000,validWeatherAreaM2:1000,missingAreaM2:0,
      coverage:1,weatherSummary:summary(),includedStates:states.map(s=>s.state),unavailableStates:[],unknownGeographyStates:[],
      record:record("cornSpatial","ten-state",{}),cropGeographyYears:[2023],contributingInputs:states.map(s=>({state:s.state,annualKey:h,weatherVersions:s.weatherVersions}))}};
}

test("production artifact, all three canonical health components and provenance",()=>{
  const a=fixture();assert.ok(validSpatial(a));
  const health=spatialHealth(a,{now,release:"release-"+h});
  assert.equal(health.length,31);assert.ok(health.every(h=>h.analysisUsable));
  assert.ok(validHealthSnapshot({schemaVersion:1,assessedAt:at,release:"release-"+h,datasets:health},"release-"+h,at));
});
test("Level C preferred when healthy, no mixed source label",()=>{
  const a=fixture(),s=a.states[0],levelA={id:s.state,weather:{rainTotal:500},period};
  const selected=selectSpatial(s,levelA,spatialHealth(a,{now}),{now});
  assert.equal(selected.method,"mapped-corn-area-weighted");assert.equal(selected.weather.precipitation14DayMm.mean,20);
});
test("Level A valid fallback explicitly identifies point method",()=>{
  const selected=selectSpatial(null,{id:"IA",weather:{rainTotal:9},period},[{id:"weather/corn-IA",analysisUsable:true}],{now});
  assert.equal(selected.method,"representative-point-fallback");assert.equal(selected.weather.rainTotal,9);
});
test("both unavailable means unavailable, never zero",()=>{
  assert.equal(selectSpatial(null,null,[],{now}).method,"unavailable");
});
test("historical/future weather cannot masquerade as current fallback",()=>{
  for(const end of ["2015-07-14","2026-11-01"])
    assert.equal(selectSpatial(null,{id:"IA",weather:{rainTotal:9},period:{end}},[{id:"weather/corn-IA",analysisUsable:true}],{now}).method,"unavailable");
  const a=fixture();assert.equal(selectSpatial(a.states[0],null,spatialHealth(a,{now:now+20*86400000}),{now:now+20*86400000}).method,"unavailable");
});
test("no silent nine-state normalization or dropped state",()=>{
  const a=fixture();a.states.pop();assert.equal(validSpatial(a),false);
  const b=fixture();b.combined.coverage=.9;assert.equal(validSpatial(b),false);
  const c=fixture();c.states[0].validWeatherAreaM2=200;assert.equal(validSpatial(c),false);
});
test("partial coverage accepted and preserved",()=>{
  const a=fixture(),s=a.states[0];s.validWeatherAreaM2=85;s.missingAreaM2=15;s.coverage=.85;s.reasons=["partial_spatial_coverage"];
  s.records.intersection.data.validWeatherAreaM2=85;
  a.combined.validWeatherAreaM2=985;a.combined.missingAreaM2=15;a.combined.coverage=.985;
  assert.ok(validSpatial(a));assert.ok(spatialHealth(a,{now}).find(h=>h.id==="cornSpatial/IA").reasons.includes("coverage_incomplete"));
});
test("wrong method, temporal window, stage claims and missing source versions rejected",()=>{
  for(const mutate of [a=>a.methodVersion="new/2",a=>a.period={...period,end:"2026-10-02"},
    a=>a.states[0].localStageEligibility="eligible",a=>a.states[0].weatherVersions.pr[0].contentHash="bad",
    a=>a.combined.contributingInputs[0].annualKey="b".repeat(64)]) {
    const a=fixture();mutate(a);assert.equal(validSpatial(a),false);
  }
});
test("older geography cannot be mislabeled current-year",()=>{
  const a=fixture();a.states[0].geographyUse="year-specific";assert.equal(validSpatial(a),false);
  const b=fixture();b.states[0].cropGeographyYear=2027;assert.equal(validSpatial(b),false);
});
test("source input is release-bound; clocks are not changed to publication clock",()=>{
  const a=fixture();a.releaseId="release-"+h;a.evaluatedAt=at;
  assert.ok(validSpatial(a,a.releaseId,at));assert.equal(validSpatial(a,"release-"+"b".repeat(64),at),false);
});
test("bilingual UI separates spatial weather from phenology/condition/supply and damage",()=>{
  const source=readFileSync(new URL("../src/components/CornSpatialWeather.jsx",import.meta.url),"utf8");
  for(const s of ["Mapped corn-area weighted weather","按玉米制图面积加权的天气","Representative-point fallback","代表点回退",
    "confirmed crop damage","受灾面积","USDA statewide crop progress","官方作物状况","供需修订"])assert.ok(source.includes(s));
});
test("spatial layer adds only coarse informational events; original alerts remain identical",async()=>{
  const official=JSON.parse(await readFile(new URL("./fixtures/official-data-baseline.json",import.meta.url)));
  const monitor=evaluateAutomaticAlerts({official,now});monitor.release={id:"release-"+h,sourceRevision:"1".repeat(40),inputsHash:h};
  const before=JSON.stringify({active:monitor.active,events:monitor.events,health:monitor.health,email:monitor.email});
  monitor.analysis=buildPhase2({official,monitor});attachCornAlignment({official,monitor});
  attachCornSpatial({spatial:fixture(),monitor});
  assert.equal(JSON.stringify({active:monitor.active,events:monitor.events,health:monitor.health,email:monitor.email}),before);
  assert.equal(monitor.analysis.changeSet.changes.filter(c=>c.datasetId==="cornSpatial").length,1);
  const previous=structuredClone(monitor),next=structuredClone(monitor);next.analysis=buildPhase2({official,monitor:next,previous});
  attachCornAlignment({official,monitor:next,previous});
  const a=fixture();a.analysisHash="b".repeat(64);a.states[0].weatherSummary.tmaxDailyMeanC.mean=21;
  a.combined.weatherSummary.tmaxDailyMeanC.mean=20.1;
  attachCornSpatial({spatial:a,monitor:next,previous});
  assert.equal(next.analysis.changeSet.changes.filter(c=>c.datasetId==="cornSpatial").length,0);
});

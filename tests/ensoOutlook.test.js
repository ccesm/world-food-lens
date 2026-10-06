import test from "node:test";
import assert from "node:assert/strict";
// Historical assertions must not follow the scheduled production cache.
import cache from "./fixtures/enso-outlook-baseline.json" with {type:"json"};
import {validateEnsoBundle,monthSpan,cropSignalOverlap,activeRegionalSignals,agriculturalExposureRows,forecastWatchIntersections,strengthOutlookSummary} from "../src/services/ensoOutlook.js";
import {seasonalClimateSignals,typicalTeleconnections} from "../src/data/seasonalClimateSignals.js";
import {productionContextShare} from "../src/services/cropWeatherAlerts.js";

const now=Date.parse("2026-09-13T18:00:00Z");
const strengthData=()=>({...structuredClone(cache.data),strengthEvidence:{
  status:"extracted",reason:"explicit-probability-event-period",issuedAt:cache.data.issuedAt,
  event:{phase:"el-nino",strength:"very-strong"},probability:{operator:"gt",percent:90},
  period:{startMonth:"2026-09",endMonth:"2027-02",label:"the Northern Hemisphere fall and winter 2026-27"},
  sourceText:"El Niño is strengthening, with a greater than 90% chance of a very strong event during the Northern Hemisphere fall and winter 2026-27.",
  sourceUrl:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml"
}});

test("strength UI never infers a probability from legacy tags or unextracted discussion",()=>{
  assert.equal(strengthOutlookSummary(cache.data),null);
  for(const sourceText of ["a very strong event is unlikely","a very strong event may develop","very strong events occurred historically",""]){
    const data=strengthData();
    data.strengthEvidence={...data.strengthEvidence,status:"not-reliably-extracted",probability:null,sourceText};
    assert.equal(strengthOutlookSummary(data),null);
  }
});

test("strength UI displays the evidence's exact probability, event and forecast period",()=>{
  const data=strengthData();
  assert.match(strengthOutlookSummary(data,"en").text,/>90%.*very strong El Niño.*2026-09 → 2027-02/);
  assert.match(strengthOutlookSummary(data,"zh").text,/非常强厄尔尼诺.*>90%.*2026-09 → 2027-02/);
  data.strengthEvidence.probability={operator:"eq",percent:75};
  data.strengthEvidence.event.strength="strong";
  data.strengthEvidence.period={startMonth:"2026-10",endMonth:"2026-12",label:"October-December 2026"};
  const text=strengthOutlookSummary(data,"en").text;
  assert.match(text,/75%.*strong El Niño.*2026-10 → 2026-12/);
  assert.doesNotMatch(text,/>90%|very strong|fall\/winter/);
  data.strengthEvidence.probability={operator:"lt",percent:10};
  assert.match(strengthOutlookSummary(data,"en").text,/<10%/);
});

test("malformed, mismatched and out-of-horizon strength evidence is suppressed without losing phase data",()=>{
  for(const edit of [
    evidence=>{delete evidence.probability;},
    evidence=>{evidence.probability.percent=101;},
    evidence=>{evidence.probability.percent=100;},
    evidence=>{evidence.probability={operator:"lt",percent:0};},
    evidence=>{evidence.probability.operator="approximately";},
    evidence=>{evidence.event.strength="historic";},
    evidence=>{evidence.issuedAt="2026-08-10";},
    evidence=>{evidence.sourceUrl="https://example.com/";},
    evidence=>{evidence.sourceText="";},
    evidence=>{evidence.period.endMonth="2028-02";},
    evidence=>{evidence.period.startMonth="2026-13";},
    evidence=>{evidence.period.endMonth="2026-08";},
  ]){
    const data=strengthData();edit(data.strengthEvidence);
    assert.equal(strengthOutlookSummary(data),null);
    assert.ok(validateEnsoBundle({...cache,data},now));
  }
});
test("NOAA cache has probability totals and ordered RONI spread",()=>{
  // Pin retrieval to the historical evaluation: checked-in caches advance.
  const valid=validateEnsoBundle({...cache,fetchedAt:new Date(now).toISOString()},now);
  assert.ok(valid&&!valid.stale);
  assert.equal(valid.data.forecasts.length,9);
  assert.equal(valid.data.forecasts[0].startMonth,"2026-08");
  assert.equal(valid.data.forecasts.at(-1).startMonth,"2027-04");
  assert.equal(valid.data.forecasts.find(x=>x.season==="MAM").elNino,82);
  assert.equal(validateEnsoBundle({...cache,data:{...cache.data,forecasts:[]}},now),null);
  assert.equal(validateEnsoBundle({...cache,fetchedAt:"2026-08-01T00:00:00Z"},now).stale,true);
  assert.equal(validateEnsoBundle({...cache,status:"error"},now).stale,true);
  assert.equal(validateEnsoBundle({...cache,fetchedAt:new Date(now+86400000).toISOString()},now).stale,true);
  const badRows=structuredClone(cache.data.forecasts);
  badRows[0].roniPercentiles[2]=-5;
  assert.equal(validateEnsoBundle({...cache,data:{...cache.data,forecasts:badRows}},now),null);
});
test("seasonal outlook only intersects declared crop calendars",()=>{
  assert.deepEqual(monthSpan("2026-11","2027-02"),["2026-11","2026-12","2027-01","2027-02"]);
  assert.equal(cropSignalOverlap(seasonalClimateSignals.find(x=>x.id==="australia-aso")).critical[0].code,"F");
  assert.equal(cropSignalOverlap(seasonalClimateSignals.find(x=>x.id==="india-aso")).critical[0].code,"F");
  assert.equal(cropSignalOverlap(seasonalClimateSignals.find(x=>x.id==="horn-ond")),null);
  assert.equal(forecastWatchIntersections(now).length,3);
  const october=Date.parse("2026-10-15T00:00:00Z");
  assert.deepEqual(forecastWatchIntersections(october).find(x=>x.signal.id==="india-aso").overlap.stages.map(x=>x.period),["2026-10"]);
  assert.equal(activeRegionalSignals(Date.parse("2026-11-01T00:00:00Z")).stale,true);
  assert.deepEqual(forecastWatchIntersections(Date.parse("2026-11-01T00:00:00Z")),[]);
});
test("typical ENSO patterns and published forecast data have separate sources",()=>{
  assert.ok(typicalTeleconnections.every(x=>x.url.includes("cpc.ncep.noaa.gov")));
  assert.ok(seasonalClimateSignals.every(x=>x.url.startsWith("https://")&&!x.url.includes("ensocycle")));
  assert.equal(typicalTeleconnections.find(x=>x.id==="east-africa").laNina,null);
});
test("national USDA shares are context, not estimated affected output",()=>{
  const byId=Object.fromEntries(seasonalClimateSignals.map(row=>[row.id,row.productionContext]));
  assert.equal(productionContextShare(byId["india-aso"]),"27.5");
  assert.equal(productionContextShare(byId["australia-aso"]),"3.8");
  assert.equal(productionContextShare(byId["southern-africa-ond"]),"1.3");
  assert.equal(byId["horn-ond"],undefined);
});
test("agricultural exposure never turns a typical ENSO tendency into current risk",()=>{
  const rows=agriculturalExposureRows(now),byId=Object.fromEntries(rows.map(row=>[row.id,row]));
  assert.equal(rows.length,4);
  assert.equal(byId["australia-wheat"].historical.direction,"dry");
  assert.equal(byId["australia-wheat"].signal.id,"australia-aso");
  assert.equal(byId["australia-wheat"].watch,"critical-window");
  assert.equal(byId["southern-africa-maize"].watch,"forecast-overlap");
  assert.equal(byId["brazil-soy"].signal,null);
  assert.equal(byId["se-asia-rice"].signal,null);
  assert.ok(byId["brazil-soy"].adjacentForecast);
  assert.ok(rows.every(row=>row.observed==="no-climate-normal"&&row.agriculturalRisk==="not-rated"));
  assert.ok(agriculturalExposureRows(Date.parse("2026-11-01T00:00:00Z")).every(row=>row.signal===null&&row.adjacentForecast==null));
  assert.deepEqual(agriculturalExposureRows(NaN),[]);
});

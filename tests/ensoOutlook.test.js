import test from "node:test";
import assert from "node:assert/strict";
import cache from "../public/data/enso-outlook.json" with {type:"json"};
import {validateEnsoBundle,monthSpan,cropSignalOverlap,activeRegionalSignals,forecastWatchIntersections} from "../src/services/ensoOutlook.js";
import {seasonalClimateSignals,typicalTeleconnections} from "../src/data/seasonalClimateSignals.js";
import {productionContextShare} from "../src/services/cropWeatherAlerts.js";

const now=Date.parse("2026-09-13T18:00:00Z");
test("NOAA cache has probability totals and ordered RONI spread",()=>{
  const valid=validateEnsoBundle(cache,now);
  assert.ok(valid&&!valid.stale);
  assert.equal(valid.data.forecasts.length,9);
  assert.equal(valid.data.forecasts[0].startMonth,"2026-08");
  assert.equal(valid.data.forecasts.at(-1).startMonth,"2027-04");
  assert.equal(valid.data.forecasts.find(x=>x.season==="MAM").elNino,82);
  assert.equal(validateEnsoBundle({...cache,data:{...cache.data,forecasts:[]}},now),null);
  assert.equal(validateEnsoBundle({...cache,fetchedAt:"2026-08-01T00:00:00Z"},now).stale,true);
  assert.equal(validateEnsoBundle({...cache,status:"error"},now).stale,true);
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

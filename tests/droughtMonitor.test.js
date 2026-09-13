import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {droughtPointSummary,soilMoistureSummary,validateDroughtBundle} from "../src/services/droughtMonitor.js";

const now=Date.parse("2026-09-13T00:00:00Z");
const maps={shortTerm:{period:"2026-08-21",url:"https://drought.emergency.copernicus.eu/api/wms?short"},longTerm:{period:"2026-08-01",url:"https://drought.emergency.copernicus.eu/api/wms?long"},impactRisk:{period:"2026-08-11",url:"https://drought.emergency.copernicus.eu/api/wms?risk"}};
const bundle={schemaVersion:1,status:"ok",fetchedAt:"2026-09-13T00:00:00Z",maps,points:{iowa:{shortTerm:"moderately-dry",longTerm:"near-normal",impactRisk:"low"}}};
test("GDO drought cache validates classifications and each layer's own age",()=>{
  assert.ok(validateDroughtBundle(bundle,now));
  const summary=droughtPointSummary(bundle,"iowa",now);
  assert.equal(summary.layers.shortTerm.value,"moderately-dry");
  assert.equal(summary.layers.shortTerm.stale,false);
  assert.equal(summary.layers.longTerm.stale,false);
  assert.equal(summary.interpret,true);
  assert.equal(droughtPointSummary({...bundle,status:"error"},"iowa",now).interpret,false);
  assert.equal(validateDroughtBundle({...bundle,points:{iowa:{...bundle.points.iowa,shortTerm:"safe"}}},now),null);
});

test("checked-in GDO cache is valid and covers every representative point",()=>{
  const cached=JSON.parse(readFileSync(new URL("../public/data/drought-monitor.json",import.meta.url)));
  const points=JSON.parse(readFileSync(new URL("../src/data/weatherPoints.json",import.meta.url)));
  assert.ok(validateDroughtBundle(cached,Math.max(now,Date.parse(cached.fetchedAt))));
  assert.deepEqual(Object.keys(cached.points).sort(),points.map(point=>point.id).sort());
});

const normals={p10:.2,p25:.3,median:.5,p75:.7,p90:.8};
const soilRecord={status:"ok",fetchedAt:"2026-09-13T00:00:00Z",soilClimatology:{baseline:"1991–2020",months:{"09":{root:normals,surface:normals}}},days:Array.from({length:9},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,"0")}`,rootWetness:.25,surfaceWetness:.85}))};
test("soil moisture compares the selected month with same-month normals",()=>{
  const result=soilMoistureSummary(soilRecord,9,2026,now);
  assert.equal(result.rootBand,"drier");
  assert.equal(result.surfaceBand,"very-wet");
  assert.equal(result.partial,true);
  assert.equal(result.interpret,true);
  assert.equal(soilMoistureSummary(soilRecord,10,2026,now),null);
  assert.equal(soilMoistureSummary({...soilRecord,days:soilRecord.days.map((d,i)=>i?d:{...d,rootWetness:2})},9,2026,now),null);
});

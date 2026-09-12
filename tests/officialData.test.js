import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import recovered from "../src/data/recoveredSnapshot.js";
import {createDashboard,getDashboardMetrics} from "../src/data/dashboardMetrics.js";
import {validateOfficialBundle,refreshOfficialData,sourceState,validSourceData} from "../src/services/officialSources.js";

const stamp="2026-09-12T05:00:00Z";
const point=(value,period="2026-08")=>({value,period,momPct:0,unit:"test"});
const record=(data,status="ok")=>({data,status,fetchedAt:stamp,lastAttemptAt:stamp,
  source:{label:"Test official source",url:"https://www.fao.org/",period:"2026-08",unit:"test"}});
const fao=()=>record({headline:point(150),monthly:[{month:"2026-06",fao:140},{month:"2026-08",fao:150}]});
const eia=()=>record({headline:point(90),monthly:[{month:"2026-06",brent:80},{month:"2026-08",brent:90}]});
const wb=()=>record({headline:{brent:point(89),urea:point(410)},monthly:[{month:"2026-06",brent:79},{month:"2026-08",brent:89}],
  fertilizers:[{nameEn:"Urea",nameZh:"尿素",price:410,momPct:0,period:"2026-08",unit:"USD / mt"}],
  agriculture:[{nameEn:"Maize",nameZh:"玉米",price:200,momPct:null,period:"2026-08",unit:"USD / mt"}]});

test("checked-in published cache is valid (including explicit unavailable sources)",()=>{
  const bundle=JSON.parse(readFileSync(new URL("../public/data/official-data.json",import.meta.url)));
  assert.equal(validateOfficialBundle(bundle),bundle);
});

test("empty adapters preserve recovered data without mutation",()=>{
  const before=structuredClone(recovered);
  const dashboard=createDashboard(recovered,{sources:{}});
  assert.deepEqual(recovered,before);
  assert.deepEqual(dashboard.monthly,recovered.monthly);
  assert.equal(getDashboardMetrics(dashboard).wheat.deltaPp,-0.7);
  assert.equal(dashboard.provenance.officialChart,false);
});

test("partial official data updates cards but does not mix into recovered chart",()=>{
  const dashboard=createDashboard(recovered,{sources:{fao:fao()}});
  assert.equal(dashboard.headline.faoFoodPriceIndex.value,150);
  assert.equal(dashboard.headline.brent.value,recovered.headline.brent.value);
  assert.deepEqual(dashboard.monthly,recovered.monthly);
});

test("official join preserves calendar gaps and only uses shared observations",()=>{
  const dashboard=createDashboard(recovered,{sources:{fao:fao(),eia:eia()}});
  assert.equal(dashboard.provenance.officialChart,true);
  assert.deepEqual(dashboard.monthly,[{month:"2026-06",fao:140,brent:80},
    {month:"2026-07",fao:null,brent:null},{month:"2026-08",fao:150,brent:90}]);
});

test("EIA wins same-period tie; newer World Bank or EIA failure changes actual provenance",()=>{
  const bank=wb(), energy=eia();
  assert.equal(createDashboard(recovered,{sources:{worldBank:bank,eia:energy}}).provenance.brent,energy);
  energy.data.headline.period="2026-07";
  assert.equal(createDashboard(recovered,{sources:{worldBank:bank,eia:energy}}).provenance.brent,bank);
  assert.equal(createDashboard(recovered,{sources:{worldBank:bank,eia:{status:"error"}}}).headline.brent.value,89);
});

test("retained official cache remains usable with original timestamps and stale/error labels",()=>{
  const retained=fao(); retained.status="error";
  assert.equal(createDashboard(recovered,{sources:{fao:retained}}).headline.faoFoodPriceIndex.value,150);
  assert.equal(sourceState(retained),"retained");
  assert.equal(sourceState(fao(),Date.parse(stamp)+73*3600000),"stale");
  assert.equal(sourceState(fao(),Date.parse(stamp)),"cached");
  assert.equal(sourceState({status:"error"}),"unavailable");
});

test("USDA cards and history use one authoritative data object",()=>{
  const usda=record({latestPeriod:"2026/2027",stockToUse:35,priorStockToUse:32,
    history:[{year:"2025/2026",ratio:32},{year:"2026/2027",ratio:35}]});
  const metrics=getDashboardMetrics(createDashboard(recovered,{sources:{usda}}));
  assert.equal(metrics.wheat.value,35); assert.equal(metrics.wheat.deltaPp,3);
  assert.deepEqual(metrics.wheatHistory,usda.data.history);
});

test("malformed cache is rejected; monthly values cannot be missing, zero or nonnumeric",()=>{
  for(const value of [NaN,Infinity,"130",0,null]){
    const invalid=fao(); invalid.data.headline.value=value;
    assert.throws(()=>validateOfficialBundle({schemaVersion:1,sources:{fao:invalid}}));
  }
  assert.throws(()=>validateOfficialBundle({schemaVersion:2,sources:{}}));
  assert.throws(()=>validateOfficialBundle({schemaVersion:1,sources:{fao:{status:"ok"}}}));
  const invalid=fao(); invalid.data.monthly[0].month="2026-13";
  assert.equal(validSourceData("fao",invalid.data),false);
  assert.ok(validSourceData("noaa",{latest:{value:1},history:[{period:"2026 MJJ",value:null},{period:"2026 JJA",value:1}]}));
});

test("browser refresh is same-site, no-store and validates response before replacing state",async()=>{
  let url,options;
  const bundle={schemaVersion:1,sources:{fao:fao()}};
  const loaded=await refreshOfficialData({baseUrl:"/world-food-lens/",fetchImpl:async(u,o)=>{
    url=u;options=o;return {ok:true,json:async()=>bundle};
  }});
  assert.equal(loaded,bundle);
  assert.match(url,/^\/world-food-lens\/data\/official-data.json\?t=\d+$/);
  assert.equal(options.cache,"no-store");
  await assert.rejects(refreshOfficialData({fetchImpl:async()=>({ok:false,status:404})}),/404/);
  await assert.rejects(refreshOfficialData({fetchImpl:async()=>({ok:true,json:async()=>({})})}),/format/);
});

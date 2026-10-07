// G1.0 contract tests. Frozen inputs only: the real PSD structure audit
// (tests/fixtures/g1-psd-structure-audit.json) and synthetic observations.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CONTRACT,COMMODITIES,METRICS,commodityId,psdGeography,WORLD,psdMarketingYear,observationId,revisionId,
  normalizePsdValue,yieldStatus,stocksToUse,revision,yoy,metricDirection,aggregateSupplyStatus,resolveSources,
  validateSupplyIndex,validateContract} from "../src/services/globalSupply.js";

const audit=JSON.parse(readFileSync(new URL("./fixtures/g1-psd-structure-audit.json",import.meta.url)));
const revisionAudit=JSON.parse(readFileSync(new URL("./fixtures/g1-revision-audit.json",import.meta.url)));
const ok=value=>({status:"ok",value});

test("the contract is internally valid",()=>{
  assert.deepEqual(validateContract(),[]);
});

test("commodity IDs: four supported from the start, G1.1 implements three",()=>{
  assert.deepEqual(COMMODITIES,["corn","wheat","rice","soybean"]);
  assert.deepEqual(COMMODITIES.filter(c=>CONTRACT.commodities[c].phase==="G1.1"),["corn","wheat","rice"]);
  assert.throws(()=>commodityId("maize"));
});

test("every source metric maps to an attribute and unit that really exist in each PSD file",()=>{
  for(const commodity of COMMODITIES){
    const {file,commodityCode,sourceDescription}=CONTRACT.commodities[commodity].sources["usda-psd"];
    const audited=audit.files[file.startsWith("psd_oilseeds")?"oilseeds":"grains"];
    assert.equal(audited.commodityDescriptions[commodity],sourceDescription,commodity);
    for(const m of CONTRACT.metrics.filter(m=>m.kind==="source")){
      const hit=audited.attributes.find(a=>a.commodity===commodity&&a.attributeId===m.psd.attributeId);
      assert.ok(hit,`${commodity}: attribute ${m.psd.attributeId} absent`);
      assert.equal(hit.attribute,m.psd.attribute,`${commodity}/${m.id}`);
      assert.equal(hit.unit,m.psd.unit,`${commodity}/${m.id} unit`);
      assert.equal(hit.unitId,m.psd.unitId,`${commodity}/${m.id} unit id`);
    }
    assert.ok(commodityCode.length===7);
  }
});

test("canonical units come from the audited source units",()=>{
  assert.equal(METRICS.production.canonicalUnit,"1000 t");
  assert.equal(METRICS.harvestedArea.canonicalUnit,"1000 ha");
  assert.equal(METRICS.yield.canonicalUnit,"t/ha");
  assert.equal(METRICS.stocksToUse.canonicalUnit,"percent");
  assert.deepEqual(normalizePsdValue("production",{attributeId:"028",unit:"(1000 HA)"},"5"),{status:"unavailable",reason:"unit_or_attribute_changed"});
});

test("geography type comes from the registry by code, never from the name",()=>{
  const eu=psdGeography("E4","Some Country Name");
  assert.equal(eu.type,"bloc");assert.equal(eu.id,"usda-psd:E4");assert.equal(eu.isoCode,null);
  assert.equal(psdGeography("E2").type,"bloc");
  const china=psdGeography("CH","China");
  assert.deepEqual([china.type,china.isoCode],["country",null]);   // FAS code is not an ISO code.
  assert.equal(psdGeography("UK","United Kingdom").isoCode,"GB");
  assert.equal(psdGeography("XX","European Union").type,"country");  // A name alone never makes a bloc.
  assert.deepEqual([WORLD.type,WORLD.derived,WORLD.id],["world",true,"wfl:world"]);
  const codes=audit.files.grains.geographies.wheat.map(g=>g.code);
  assert.ok(codes.includes("E4")&&!codes.includes("WD"));             // No official World row in PSD.
});

test("marketing year keeps the source identity and never assumes a calendar window",()=>{
  assert.deepEqual(psdMarketingYear(2026),{system:"usda-psd",sourceId:"2026",label:"2026/27",startMonth:null});
  assert.equal(psdMarketingYear("1999").label,"1999/00");
  assert.throws(()=>psdMarketingYear("2026/27"));
});

test("observation and revision identities are stable IDs, not display names",()=>{
  const id=observationId({commodity:"corn",geography:psdGeography("BR","Brazil"),marketingYear:psdMarketingYear(2026),metric:"production"});
  assert.equal(id,"g1:corn:usda-psd:BR:2026:production");
  assert.equal(revisionId(id,"usda-psd","2026-09","2026-10"),`${id}@usda-psd:2026-09->2026-10`);
});

test("missing is not zero; zero is a flagged source value; negatives follow the metric rule",()=>{
  const prod={attributeId:"028",unit:"(1000 MT)"};
  assert.deepEqual(normalizePsdValue("production",prod,""),{status:"missing",value:null});
  assert.deepEqual(normalizePsdValue("production",prod,"0"),{status:"ok",value:0,flags:["source-zero-filled"]});
  assert.deepEqual(normalizePsdValue("production",prod,"-4"),{status:"unavailable",reason:"impossible_negative"});
  const use={attributeId:"125",unit:"(1000 MT)"};
  assert.deepEqual(normalizePsdValue("domesticUse",use,"-3"),{status:"ok",value:-3,flags:["negative-source-value"]});
});

test("not-applicable: yield with zero area, and direction for contextual metrics",()=>{
  assert.deepEqual(yieldStatus(0,0),{status:"not-applicable",value:null});
  assert.deepEqual(yieldStatus(0,12).flags,["zero-yield-with-area"]);
  for(const metric of ["exports","imports","domesticUse"])assert.equal(metricDirection(metric,-50,1),"not-applicable");
});

test("stocks-to-use is unknown whenever its denominator is unusable",()=>{
  assert.deepEqual(stocksToUse(ok(20),ok(80)),{status:"ok",value:25});
  for(const use of [ok(0),ok(-5),{status:"missing",value:null},{status:"not-applicable",value:null},{status:"unavailable"}])
    assert.equal(stocksToUse(ok(20),use).status,"unknown");
});

test("first observation has no revision, and revision is not YoY",()=>{
  assert.deepEqual(revision(ok(100),undefined),{revision:null,revisionPct:null,status:"unknown"});
  assert.deepEqual(revision(ok(97.6),ok(100)),{revision:-2.4000000000000057,revisionPct:-2.4000000000000057,status:"ok"});
  const y=yoy(ok(120),ok(100));
  assert.ok(!("revision" in y));assert.equal(y.yoyChange,20);assert.equal(y.yoyChangePct,20);
  assert.equal(revision(ok(5),ok(0)).status,"unknown");                 // Percent on a zero base is undefined.
});

test("direction polarity and inclusive dead-zone boundary",()=>{
  assert.equal(metricDirection("production",-2.4,1),"tightening");
  assert.equal(metricDirection("endingStocks",3,1),"easing");
  assert.equal(metricDirection("stocksToUse",-1,1),"stable");           // |pct| == dead zone is stable.
  assert.equal(metricDirection("yield",1.0000001,1),"easing");
  assert.equal(metricDirection("production",-0.5,0),"tightening");
  assert.equal(metricDirection("production",-5,null),"unknown");        // Draft dead zone -> unknown.
  assert.equal(metricDirection("production",null,1),"unknown");
  const direction=CONTRACT.interpretationRules.find(r=>r.ruleId==="g1_metric_direction");
  assert.equal(direction.status,"draft");
  assert.deepEqual(direction.parameters.deadZonesPct,{revision:null,yoy:null});
});

test("draft aggregate status is traceable counts, never a score",()=>{
  const r=aggregateSupplyStatus({production:"tightening",endingStocks:"stable",stocksToUse:"tightening",exports:"easing"});
  assert.equal(r.status,"tightening");
  assert.deepEqual(r.evidence.map(e=>e.metric),["production","endingStocks","stocksToUse"]); // Exports never counted.
  assert.equal(aggregateSupplyStatus({production:"tightening",endingStocks:"easing",stocksToUse:"stable"}).status,"mixed");
  assert.equal(aggregateSupplyStatus({production:"stable",endingStocks:"stable"}).status,"unknown");
  assert.equal(r.ruleStatus,"draft");
  assert.ok(!("score" in r));
});

test("conflicting sources are exposed, never silently resolved",()=>{
  const usda={source:"usda-psd",sourceTier:1,status:"ok",value:169000};
  const other={source:"conab",sourceTier:1,status:"ok",value:171500};
  assert.equal(resolveSources([usda,other]).status,"conflicting");
  assert.equal(resolveSources([usda,{...other,value:169000}]).status,"ok");
  assert.equal(resolveSources([]).status,"missing");
});

test("failure isolation: one status per commodity, never one file status",()=>{
  const provenance={source:"usda-psd",sourceDataset:"psd_grains_pulses_csv.zip",sourceRelease:"2026-09",sourceDate:"2026-09",
    retrievedAt:"2026-10-07T22:20:01Z",rawFileHash:"a".repeat(64),dataRevision:"b".repeat(40)};
  const index={contractVersion:CONTRACT.contractVersion,commodities:{corn:{status:"ok",provenance},
    wheat:{status:"unavailable",reason:"unit_or_attribute_changed"},rice:{status:"ok",provenance}}};
  assert.deepEqual(validateSupplyIndex(index),[]);
  assert.ok(validateSupplyIndex({...index,status:"ok"}).some(e=>/file-level status/.test(e)));
  assert.ok(validateSupplyIndex({...index,commodities:{...index.commodities,wheat:{status:"unavailable"}}}).some(e=>/reason/.test(e)));
  assert.ok(validateSupplyIndex({...index,commodities:{...index.commodities,rice:{status:"ok",provenance:{}}}}).some(e=>/provenance/.test(e)));
});

test("the revision audit honestly reports that no release pair exists yet",()=>{
  assert.deepEqual(revisionAudit.releasesFound,["2026-09"]);
  assert.equal(revisionAudit.releasePairs,0);
  assert.deepEqual(revisionAudit.absoluteRevisionPctByMetric,{});
});

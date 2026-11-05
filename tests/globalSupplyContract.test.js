// G1.0 contract tests. Frozen inputs only: the real PSD structure audit
// (tests/fixtures/g1-psd-structure-audit.json) and synthetic observations.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CONTRACT,COMMODITIES,METRICS,commodityId,psdGeography,WORLD,psdMarketingYear,observationId,revisionId,
  normalizePsdValue,yieldStatus,stocksToUse,revision,yoy,metricDirection,aggregateSupplyStatus,resolveSources,
  validateSupplyIndex,validateContract,assessReleaseVersion,assessGeographyCoverage} from "../src/services/globalSupply.js";

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
  assert.deepEqual(revision(ok(100),undefined),{currentEstimate:100,previousEstimate:null,revision:null,revisionPct:null,status:"unknown"});
  const r=revision(ok(97.6),ok(100));
  assert.deepEqual([r.currentEstimate,r.previousEstimate,r.status],[97.6,100,"ok"]);
  assert.ok(Math.abs(r.revision+2.4)<1e-12&&Math.abs(r.revisionPct+2.4)<1e-12);
  const y=yoy(ok(120),ok(100));
  assert.ok(!("revision" in y)&&!("previousEstimate" in y));assert.equal(y.yoyChange,20);assert.equal(y.yoyPct,20);
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
  assert.deepEqual(r.evidence.map(e=>e.metric),["production","endingStocks"]); // No duplicate stock evidence.
  assert.equal(aggregateSupplyStatus({production:"tightening",endingStocks:"easing",stocksToUse:"stable"}).status,"mixed");
  assert.equal(aggregateSupplyStatus({production:"stable",endingStocks:"stable"}).status,"stable");
  assert.equal(aggregateSupplyStatus({production:"stable"}).status,"unknown");
  assert.equal(aggregateSupplyStatus({production:"invalid",endingStocks:"stable"}).status,"unknown");
  assert.equal(METRICS.stocksToUse.inAggregateCore,false);
  assert.equal(r.ruleStatus,"draft");
  assert.ok(!("score" in r));
});

test("conflicting sources are exposed, never silently resolved",()=>{
  const usda={source:"usda-psd",sourceTier:1,status:"ok",value:169000,observationId:"g1:corn:usda-psd:BR:2026:production",
    unit:"1000 t",basis:"grain",comparisonPeriod:"2026/27",sourceRelease:"2026-09"};
  const other={...usda,source:"conab",value:171500};
  assert.equal(resolveSources([usda,other]).status,"conflicting");
  assert.equal(resolveSources([usda,{...other,value:169000}]).status,"ok");
  assert.equal(resolveSources([]).status,"missing");
});

const comparable={source:"usda-psd",sourceTier:1,status:"ok",value:100,observationId:"g1:corn:usda-psd:BR:2026:production",
  unit:"1000 t",basis:"grain",comparisonPeriod:"2026/27",sourceRelease:"2026-09"};
test("official world totals preferred; derived world is cross-check/fallback, never a credential blocker",()=>{
  assert.match(CONTRACT.worldAggregatePolicy.preferredCanonical,/Official USDA world/);
  assert.match(CONTRACT.worldAggregatePolicy.derivedRole,/cross-checks/);
  assert.equal(CONTRACT.worldAggregatePolicy.apiKeyAvailabilityBlocksG1_1,false);
  assert.deepEqual(CONTRACT.metrics.filter(m=>m.inAggregateCore).map(m=>m.id),["production","endingStocks"]);
});

test("source priority keeps lower tiers as context, never as Tier 1 conflicts",()=>{
  const lower={...comparable,source:"news",sourceTier:3,value:500};
  const before=structuredClone([comparable,lower]);
  const result=resolveSources(before);
  assert.equal(result.status,"ok");assert.deepEqual(result.preferred,[comparable]);
  assert.deepEqual(result.lowerPriority,[lower]);assert.deepEqual(result.observations,before);
  assert.equal(resolveSources([lower,{...lower,source:"institution",sourceTier:2,value:300}]).preferred[0].sourceTier,2);
  assert.equal(resolveSources([comparable,{...lower,sourceTier:undefined}]).status,"unknown");
});

test("different releases, bases, units, periods and observations are not comparable conflicts",()=>{
  for(const [key,value] of Object.entries({sourceRelease:"2026-08",basis:"rough-rice",unit:"t",comparisonPeriod:"2025/26",observationId:"other"})){
    const r=resolveSources([comparable,{...comparable,source:"other",value:200,[key]:value}]);
    assert.equal(r.status,"unknown",key);assert.equal(r.reason,"not_comparable");
  }
  for(const key of CONTRACT.conflicts.comparisonFields){
    const r=resolveSources([{...comparable,[key]:undefined}]);
    assert.equal(r.status,"unknown",key);
  }
  assert.equal(resolveSources([{...comparable,value:NaN}]).status,"unknown");
  assert.equal(resolveSources([{...comparable,status:"stale"}]).status,"unknown");
  assert.equal(resolveSources([comparable,{...comparable,value:90}]).reason,"same_source_revision_unordered");
});

const version={observationId:comparable.observationId,source:"usda-psd",sourceDataset:"grains",sourceRelease:"2026-09",rawFileHash:"a".repeat(64)};
test("release monotonicity rejects older vintage despite later fetch/cache times and retains previous",()=>{
  const old={...version,sourceRelease:"2026-10",retrievedAt:"2026-10-09T16:00:00Z"};
  const incoming={...version,retrievedAt:"2026-10-10T16:00:00Z",cacheUpdatedAt:"2026-10-10T17:00:00Z"};
  const copy=structuredClone(old),result=assessReleaseVersion(incoming,old);
  assert.equal(result.accepted,false);assert.equal(result.reason,"publication_regression");
  assert.deepEqual(result.retained,copy);assert.deepEqual(old,copy);
  assert.equal(assessReleaseVersion(old,version).kind,"new-publication");
  assert.equal(assessReleaseVersion(version,null).kind,"first-publication");
  assert.equal(assessReleaseVersion(version,version).kind,"unchanged");
});

test("same-vintage revisions require an authenticated order, not a fetch timestamp/hash",()=>{
  const correction={...version,rawFileHash:"b".repeat(64)};
  assert.equal(assessReleaseVersion(correction,version).reason,"same_vintage_revision_unordered");
  const previous={...version,revisionSequence:1,revisionOrderSource:"source-authenticated"};
  const next={...correction,revisionSequence:2,revisionOrderSource:"source-authenticated"};
  assert.equal(assessReleaseVersion(next,previous).kind,"same-vintage-revision");
  assert.equal(assessReleaseVersion(previous,next).reason,"same_vintage_revision_regression");
  assert.equal(assessReleaseVersion({...next,revisionSequence:1},previous).accepted,false);
  assert.equal(assessReleaseVersion({...next,revisionOrderSource:"fetch-counter"},previous).accepted,false);
  assert.equal(assessReleaseVersion({...next,sourceRelease:"2026-13"},previous).accepted,false);
  assert.equal(assessReleaseVersion({...next,observationId:"another-year"},previous).reason,"observation_identity_mismatch");
});

const geoRow=(code,value=0,status="ok")=>({geography:psdGeography(code),value,status});
test("missing entire geography cannot disappear from denominator, including source-zero countries",()=>{
  const expectedIds=["usda-psd:US","usda-psd:BR","usda-psd:UK"];
  const options={expectedIds,marketYear:2026};
  const full=[geoRow("US",100),geoRow("BR",50),geoRow("UK",0)];
  assert.equal(assessGeographyCoverage(full,options).status,"ok");
  const partial=assessGeographyCoverage(full.slice(0,2),options);
  assert.equal(partial.status,"unavailable");assert.deepEqual(partial.missingIds,["usda-psd:UK"]);
  assert.equal(partial.geographyCountCoverage,2/3); // Neither weighted completeness nor normalized 100%.
  assert.equal(assessGeographyCoverage([...full.slice(0,2),geoRow("UK",null,"missing")],options).presentCount,2);
  assert.equal(assessGeographyCoverage(full).status,"unknown");
  assert.equal(assessGeographyCoverage([...full,geoRow("US",100)],options).status,"unavailable");
  assert.equal(assessGeographyCoverage([...full,geoRow("XX",1)],options).status,"unavailable");
});

test("EU aggregate counted once with reviewed member IDs; separate UK stays included after 2016",()=>{
  const options={expectedIds:["usda-psd:E4","usda-psd:UK","usda-psd:US"],marketYear:2026,euMemberIds:["usda-psd:FR"]};
  const rows=[geoRow("E4",100),geoRow("E2",90),geoRow("FR",20),geoRow("UK",10),geoRow("US",200)];
  const result=assessGeographyCoverage(rows,options);
  assert.equal(result.status,"ok");assert.deepEqual(result.presentIds,["usda-psd:E4","usda-psd:UK","usda-psd:US"]);
  assert.deepEqual(result.excludedIds,["usda-psd:E2","usda-psd:FR"]);
  assert.equal(rows.filter(r=>result.presentIds.includes(r.geography.id)).reduce((sum,r)=>sum+r.value,0),310);
  assert.equal(assessGeographyCoverage(rows.filter(r=>r.geography.sourceId!=="E4"),options).status,"unavailable");
  const historic=assessGeographyCoverage(rows,{...options,marketYear:1998,expectedIds:["usda-psd:E2","usda-psd:US"]});
  assert.equal(historic.status,"ok");assert.deepEqual(historic.excludedIds,["usda-psd:E4","usda-psd:FR","usda-psd:UK"]);
  assert.equal(rows.filter(r=>historic.presentIds.includes(r.geography.id)).reduce((sum,r)=>sum+r.value,0),290);
  assert.equal(assessGeographyCoverage(rows,{...options,expectedIds:[...options.expectedIds,"usda-psd:FR"]}).status,"unknown");
});

test("frozen audited year-specific geography provides an explicit baseline for each commodity",()=>{
  for(const commodity of COMMODITIES){
    const file=commodity==="soybean"?audit.files.oilseeds:audit.files.grains;
    const marketYear=file.latestMarketYear[commodity];
    const expectedIds=file.geographies[commodity].filter(g=>g.firstMarketYear<=marketYear&&g.lastMarketYear>=marketYear).map(g=>`usda-psd:${g.code}`);
    const rows=expectedIds.map(id=>geoRow(id.split(":")[1]));
    assert.equal(assessGeographyCoverage(rows,{expectedIds,marketYear}).status,"ok",commodity);
    const partial=assessGeographyCoverage(rows.slice(1),{expectedIds,marketYear});
    assert.equal(partial.missingIds.length,1,commodity);
    assert.ok(partial.geographyCountCoverage<1);
  }
});

test("blank, absent and malformed source values never become numeric source zeros",()=>{
  const mapping=METRICS.production.psd;
  for(const input of [undefined,null,""," ","\t\n"])
    assert.deepEqual(normalizePsdValue("production",mapping,input),{status:"missing",value:null});
  for(const input of [false,true,[],{},NaN,Infinity,"NA"])
    assert.equal(normalizePsdValue("production",mapping,input).status,"unavailable");
  for(const input of [0,"0"," 0 "])
    assert.deepEqual(normalizePsdValue("production",mapping,input),{status:"ok",value:0,flags:["source-zero-filled"]});
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

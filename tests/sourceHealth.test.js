import test from "node:test";
import assert from "node:assert/strict";
import {publicationState,sourceHealth,healthState,healthLabel,validHealthDetails} from "../src/services/sourceHealth.js";
import {officialHealth,sourceState} from "../src/services/officialSources.js";
const time = s => Date.parse(`${s}T12:00:00Z`);

test("daily collection lag crosses month/year boundaries without a source outage",()=>{
  for(const [now,period] of [["2026-10-01","2026-09-27"],["2026-10-04","2026-09-30"],["2027-01-02","2026-12-29"]]){
    assert.equal(publicationState("weather",period,time(now)),"current");
    assert.equal(publicationState("soil",period,time(now)),"awaiting");
  }
  assert.equal(publicationState("soil","2026-09-30",time("2026-10-05")),"overdue");
  assert.equal(publicationState("weather","2026-09-20",time("2026-10-04")),"overdue");
  assert.equal(publicationState("soil","2026-10-01",time("2026-10-05")),"current");
});

test("monthly cadence uses confirmed releases with grace, not calendar turnover",()=>{
  assert.equal(publicationState("fao","2026-08",time("2026-10-01")),"awaiting");
  assert.equal(publicationState("fao","2026-08",time("2026-10-04")),"awaiting");
  assert.equal(publicationState("fao","2026-08",time("2026-10-05")),"overdue");
  assert.equal(publicationState("fao","2026-09",time("2026-10-05")),"current");
  assert.equal(publicationState("usda","2026-09",time("2026-10-04")),"awaiting");
  assert.equal(publicationState("usda","2026-09",time("2026-10-12")),"overdue");
  assert.equal(publicationState("enso","2026-09-10",time("2026-10-04")),"awaiting");
  assert.equal(publicationState("enso","2026-09-10",time("2026-10-11")),"overdue");
  assert.equal(publicationState("fao","2026-11",time("2027-01-02")),"unknown");
  assert.equal(publicationState("worldBank","2026-08",time("2026-10-02")),"unknown");
  assert.equal(publicationState("drought","2026-08-01",time("2026-10-02")),"overdue");
  for(const period of [null,"invalid","2026-02-30","2026-11-01"])
    assert.equal(publicationState("soil",period,time("2026-10-04")),"unknown");
});

test("health separates retrieval, validation, publication and specific evidence",()=>{
  const now=time("2026-10-04"),record={status:"ok",fetchedAt:new Date(now).toISOString()};
  const normal=sourceHealth(record,{now,publication:"awaiting"});
  assert.deepEqual(normal,{retrieval:"ok",validation:"passed",freshness:"awaiting",eligibility:"insufficient"});
  assert.equal(healthState(normal),"awaiting");
  assert.equal(healthState(sourceHealth(record,{now,publication:"current"})),"insufficient");
  for(const [kind,state,retrieval] of [["retrieval","retrieval-failed","failed"],["validation","validation-failed","ok"],["unknown","unknown","unknown"]]){
    const row=sourceHealth({...record,status:"error",failureKind:kind},{now,publication:"current"});
    assert.equal(healthState(row),state);assert.equal(row.retrieval,retrieval);
    assert.doesNotMatch(healthLabel(row,"zh"),/中断/);
  }
  assert.equal(healthState(sourceHealth({...record,fetchedAt:"2026-09-20T12:00:00Z"},{now,publication:"current"})),"stale");
  assert.equal(validHealthDetails(normal),true);
  assert.equal(validHealthDetails({retrieval:"ok"}),false);
});

test("FAO retained cache keeps independent publication age and failure labels",()=>{
  const now=time("2026-10-04"),record={status:"error",failureKind:"retrieval",fetchedAt:"2026-10-03T12:00:00Z",
    source:{period:"2026-09"},data:{headline:{value:110,momPct:10,period:"2026-09",unit:"index"},monthly:[{month:"2026-08",fao:100},{month:"2026-09",fao:110}]}};
  const before=structuredClone(record),row=officialHealth("fao",record,now);
  assert.equal(row.retrieval,"failed");assert.equal(row.freshness,"current");assert.equal(row.eligibility,"insufficient");
  assert.equal(sourceState(record,now),"retained");assert.deepEqual(record,before);
  assert.equal(officialHealth("fao",record,time("2026-10-10")).freshness,"stale");
});

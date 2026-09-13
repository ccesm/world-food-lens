import test from "node:test";
import assert from "node:assert/strict";
import {cropCalendars,STAGES} from "../src/data/cropCalendars.js";
import {stageForMonth,seasonalPriorities,winterExposure} from "../src/services/cropCalendar.js";
const crop=id=>cropCalendars.find(row=>row.id===id);
test("all calendar templates disclose estimates and valid twelve-month stages",()=>{
  assert.equal(new Set(cropCalendars.map(r=>r.id)).size,cropCalendars.length);
  for(const r of cropCalendars){assert.equal(r.months.length,12);assert.ok(r.months.every(x=>STAGES[x]));
    assert.equal(r.sourceType,"estimated");assert.equal(r.confidence,"medium");assert.match(r.source,/^https:\/\//);}
});
test("northern crop critical stages differ from post-harvest exposure",()=>{
  assert.equal(stageForMonth(crop("us-corn"),7).code,"F");
  assert.equal(stageForMonth(crop("us-corn"),12).critical,false);
  assert.equal(stageForMonth(crop("russia-wheat"),1).code,"W");
  assert.equal(stageForMonth(crop("russia-wheat"),6).code,"G");
  assert.equal(stageForMonth(crop("india-rice"),9).code,"F");
});
test("southern and cross-year seasons map without northern hemisphere assumptions",()=>{
  assert.equal(stageForMonth(crop("brazil-safrinha"),2).code,"P");
  assert.equal(stageForMonth(crop("brazil-safrinha"),5).code,"F");
  assert.equal(stageForMonth(crop("brazil-soy"),1).code,"F");
  assert.equal(stageForMonth(crop("australia-wheat"),6).code,"P");
  assert.equal(stageForMonth(crop("australia-wheat"),9).code,"F");
});
test("missing calendar or invalid dates do not produce a normal risk state",()=>{
  for(const month of [0,13,NaN,1.5])assert.equal(stageForMonth(crop("us-corn"),month),null);
  assert.equal(stageForMonth(null,1),null);assert.deepEqual(seasonalPriorities([],9),[]);
  const priorities=seasonalPriorities(cropCalendars,7);
  assert.ok(priorities.every(r=>r.stage.critical));
  assert.ok(priorities.every((r,i)=>!i||r.stage.sensitivity<=priorities[i-1].stage.sensitivity));
});
test("winterkill checklist requires all exposures; cold alone is not a prediction",()=>{
  assert.equal(winterExposure(),"unknown");
  assert.equal(winterExposure({severeCold:true}),"unknown");
  assert.equal(winterExposure({winterCrop:true,severeCold:true,lowSnow:true,prolonged:true}),"joint-exposure");
  assert.equal(winterExposure({winterCrop:true,severeCold:true,lowSnow:false,prolonged:true}),"not-all-present");
  assert.equal(winterExposure({winterCrop:false,severeCold:true,lowSnow:true,prolonged:true}),"not-all-present");
});

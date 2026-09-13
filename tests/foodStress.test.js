import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {percentile,inventorySummary,priceSignal,combineEvidence,buildFoodStress,RISK_WEIGHTS,riskLevel} from "../src/services/foodStress.js";
import {validateOfficialBundle} from "../src/services/officialSources.js";
const load=()=>{
  const b=JSON.parse(readFileSync(new URL("../public/data/official-data.json",import.meta.url)));
  // Unit-test a successful-source scenario independently of the scheduled job's
  // latest network outcome. Retained-cache publication must remain possible.
  for(const record of Object.values(b.sources))record.status="ok";
  return b;
};
const fresh=b=>Math.max(...Object.values(b.sources).map(r=>Date.parse(r.fetchedAt)||0))+1000;
test("percentiles exclude missing values and treat ties neutrally",()=>{
  assert.equal(percentile(5,Array(10).fill(5)),50);
  assert.equal(percentile(0,Array(10).fill(5)),0);
  assert.equal(percentile(6,Array(10).fill(5)),100);
  assert.equal(percentile(5,[1,2]),null);
  assert.equal(percentile(null,Array(10).fill(5)),null);
});
test("missing evidence is neither zero nor renormalized",()=>{
  const model=combineEvidence({stocks:100,prices:50});
  assert.equal(model.coverage,30);assert.equal(model.known,25);assert.equal(model.score,null);
  assert.deepEqual(model.bounds,[25,95]);assert.equal(model.level,"unavailable");
  const empty=combineEvidence({stocks:NaN,energy:120});assert.equal(empty.coverage,0);
  const full=combineEvidence(Object.fromEntries(Object.keys(RISK_WEIGHTS).map(k=>[k,50])));
  assert.equal(full.coverage,100);assert.equal(full.score,50);assert.equal(full.level,"elevated");
});
test("risk boundaries agree with the stated scale, including 48.75",()=>{
  assert.deepEqual([0,20,20.1,40,48.75,60,60.1,80,80.1,100,-1,null].map(riskLevel),
    ["low","low","moderate","moderate","elevated","elevated","high","high","critical","critical","unavailable","unavailable"]);
});
test("inventory compares prior vintages and subtracts both denominator and numerator",()=>{
  const b=load(),g=b.sources.usda.data.grains.wheat;
  const w=inventorySummary(g),ex=inventorySummary(g,"excludingChina");
  assert.equal(w.count,g.history.length-1);assert.equal(w.referenceEnd,g.history.at(-2).year);
  assert.ok(ex.current.ratio<w.current.ratio);assert.notEqual(ex.current.consumption,w.current.consumption);
  const missing=structuredClone(g);missing.history[0].excludingChina=null;
  assert.equal(inventorySummary(missing,"excludingChina"),null);
});
test("price signals report level percentile and independent year-on-year change",()=>{
  const rows=Array.from({length:49},(_,i)=>({month:`${2020+Math.floor(i/12)}-${String(i%12+1).padStart(2,"0")}`,v:100+i}));
  const s=priceSignal(rows,"v");assert.equal(s.score,100);assert.equal(s.count,48);
  assert.equal(s.referenceEnd,"2023-12");assert.equal(s.yoy,(148/136-1)*100);
  assert.equal(priceSignal(rows.filter((_,i)=>i!==20),"v"),null);
  assert.equal(priceSignal(rows.map((r,i)=>i===0?{...r,v:null}:r),"v"),null);
});
test("published official data provide only 45% coverage; old/error data do not score",()=>{
  const b=load(),now=fresh(b),s=buildFoodStress(b,now);
  assert.equal(s.coverage,45);assert.equal(s.score,null);
  const bad=structuredClone(b);bad.sources.worldBank.status="error";
  assert.equal(buildFoodStress(bad,now).coverage,30);
  assert.equal(buildFoodStress(b,now+74*3600000).coverage,0);
  assert.equal(buildFoodStress({sources:{}},now).coverage,0);
  const future=structuredClone(b);future.sources.fao.fetchedAt=new Date(now+3600000).toISOString();
  assert.equal(buildFoodStress(future,now).coverage,35);
});
test("malformed new grain cache fails validation while legacy wheat remains supported",()=>{
  const b=load();assert.equal(validateOfficialBundle(b),b);
  const bad=structuredClone(b);bad.sources.usda.data.grains.rice.history.at(-1).consumption=0;
  assert.throws(()=>validateOfficialBundle(bad));
  delete b.sources.usda.data.grains;assert.equal(validateOfficialBundle(b),b);
});

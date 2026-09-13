import test from "node:test";
import assert from "node:assert/strict";
import {buildPriceForecast,monthOffset,fitMomentum} from "../src/services/priceForecast.js";

const rows = (count=160) => Array.from({length:count},(_,i)=>({month:monthOffset("2000-01",i),fao:100*Math.exp(.001*i+.05*Math.sin(i/3))}));
test("forecast rolls across years with finite ordered error bands and 12 horizons",()=>{
  assert.equal(monthOffset("2026-12",1),"2027-01");
  const data=rows(),result=buildPriceForecast(data);
  assert.equal(result.available,true);assert.equal(result.points.length,12);
  assert.equal(result.points[0].month,monthOffset(data.at(-1).month,1));
  assert.equal(result.points.at(-1).month,monthOffset(data.at(-1).month,12));
  for(const p of result.points){assert.ok(p.band[0]<=p.forecast&&p.band[1]>=p.forecast);assert.ok(p.samples>=12);assert.ok(Number.isFinite(p.mae));}
});
test("constant prices remain constant and match naive errors",()=>{
  const result=buildPriceForecast(rows().map(r=>({...r,fao:100})));
  for(const p of result.points){assert.equal(p.forecast,100);assert.equal(p.mae,0);assert.equal(p.naiveMae,0);}
});
test("gaps, invalid values, duplicates, insufficient samples and invalid shocks fail closed",()=>{
  const data=rows();
  for(const input of [data.slice(0,50),data.filter((_,i)=>i!==20),[...data,data.at(-1)],data.map((r,i)=>i===0?{...r,fao:NaN}:r)]) assert.equal(buildPriceForecast(input).available,false);
  assert.equal(buildPriceForecast(data,Infinity).available,false);
});
test("user scenario does not change fitted baseline, bands or historical evaluation",()=>{
  const data=rows(),before=JSON.stringify(data),base=buildPriceForecast(data),scenario=buildPriceForecast(data,20);
  assert.equal(scenario.points.at(-1).scenario/base.points.at(-1).forecast,1.2);
  assert.deepEqual(scenario.points.map(p=>[p.forecast,p.band,p.mae]),base.points.map(p=>[p.forecast,p.band,p.mae]));
  assert.equal(JSON.stringify(data),before);
});
test("training a historical origin cannot consume subsequent observations",()=>{
  const data=rows(),prefix=data.slice(0,120),fit=fitMomentum(prefix);
  data[150].fao=99999;
  assert.deepEqual(fitMomentum(data.slice(0,120)),fit);
  // An explicit one-step calculation checks the rolling MAE against origin-only fits.
  const result=buildPriceForecast(data),errors=[];
  for(let origin=Math.max(59,data.length-72);origin<data.length-12;origin++){
    const model=fitMomentum(data.slice(Math.max(0,origin-119),origin+1));
    const predicted=model.last*Math.exp(model.lastReturn*model.phi);
    errors.push(Math.abs(data[origin+1].fao-predicted));
  }
  assert.ok(Math.abs(result.points[0].mae-errors.reduce((a,b)=>a+b,0)/errors.length)<1e-10);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {weatherSummary} from "../src/services/localWeather.js";
import {cropCalendars} from "../src/data/cropCalendars.js";
const points=JSON.parse(readFileSync(new URL('../src/data/weatherPoints.json',import.meta.url)));
const now=Date.parse('2026-09-13T00:00:00Z');
const days=Array.from({length:30},(_,i)=>({date:new Date(Date.UTC(2026,7,11+i)).toISOString().slice(0,10),min:15,max:36,rain:0}));
const record={status:'ok',fetchedAt:'2026-09-13T00:00:00Z',days};
test('every existing crop window has exactly one declared representative point',()=>{
  for(const crop of cropCalendars)assert.equal(points.filter(p=>p.crops.includes(crop.id)).length,1);
  assert.equal(new Set(points.map(p=>`${p.lat},${p.lon}`)).size,points.length);
});
test('weather summaries use dates and stage overlap, not selected future stage',()=>{
  const crop=cropCalendars.find(c=>c.id==='us-corn');
  const s=weatherSummary(record,crop,9,now);
  assert.equal(s.heat,30);assert.equal(s.dry,30);assert.equal(s.rain,0);
  assert.equal(s.sensitiveDays,21);assert.equal(s.sensitiveHeat,21);
  assert.equal(s.interpret,true);assert.equal(weatherSummary(record,crop,7,now).interpret,false);
});
test('failed, stale and incomplete weather cannot be interpreted as current',()=>{
  const c=cropCalendars[0];
  assert.equal(weatherSummary({...record,status:'error'},c,9,now).interpret,false);
  assert.equal(weatherSummary(record,c,9,now+12*86400000).interpret,false);
  assert.equal(weatherSummary({...record,days:days.slice(1)},c,9,now),null);
  for(const patch of [{rain:null},{max:-999},{min:40},{date:'2026-08-99'},{rain:-1}]){
    assert.equal(weatherSummary({...record,days:days.map((d,i)=>i===0?{...d,...patch}:d)},c,9,now),null);
  }
});
test('checked-in NASA point records have complete physically valid daily windows',()=>{
  const bundle=JSON.parse(readFileSync(new URL('../public/data/local-weather.json',import.meta.url)));
  assert.equal(bundle.schemaVersion,1);
  for(const point of points){
    const r=bundle.points[point.id];
    // Failed first fetch may be empty, but never fabricate a zero-valued record.
    if(!r?.days){assert.equal(r?.status,'error');continue;}
    const c=cropCalendars.find(c=>point.crops.includes(c.id));
    assert.ok(weatherSummary(r,c,9,Math.max(Date.parse(r.fetchedAt),Date.parse(r.days.at(-1).date))));
    assert.ok(r.url.startsWith('https://power.larc.nasa.gov/api/'));
  }
});

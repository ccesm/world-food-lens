import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {weatherSummary as summarize} from "../src/services/localWeather.js";
const weatherSummary=(r,c,m,now)=>summarize(r,c,m,now,new Date(now).getUTCFullYear(),"recent");
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
const monthlyRecord=(year,month,count)=>({status:'ok',fetchedAt:'2026-09-13T00:00:00Z',days:Array.from({length:count},(_,i)=>({date:new Date(Date.UTC(year,month-1,i+1)).toISOString().slice(0,10),max:36,min:10,rain:2}))});
test('July uses July dates and full-month totals, never latest weather',()=>{
  const r=monthlyRecord(2026,7,31);
  r.days.push(...monthlyRecord(2026,8,31).days.map(d=>({...d,rain:100})));
  const s=summarize(r,cropCalendars[0],7,now,2026);
  assert.equal(s.start,'2026-07-01');assert.equal(s.end,'2026-07-31');
  assert.equal(s.rain,62);assert.equal(s.sensitiveDays,31);assert.equal(s.historical,true);
  assert.equal(s.partial,false);assert.equal(s.interpret,true);
});
test('February handles leap years and rejects incomplete historical months',()=>{
  assert.equal(summarize(monthlyRecord(2024,2,29),cropCalendars[0],2,now,2024).days.length,29);
  assert.equal(summarize(monthlyRecord(2025,2,28),cropCalendars[0],2,now,2025).days.length,28);
  assert.equal(summarize(monthlyRecord(2024,2,28),cropCalendars[0],2,now,2024),null);
});
test('current month is explicitly partial; future and missing periods have no substitute',()=>{
  const r=monthlyRecord(2026,9,9);
  const s=summarize(r,cropCalendars[0],9,now,2026);
  assert.equal(s.partial,true);assert.equal(s.days.length,9);assert.equal(s.rain,18);
  assert.equal(summarize(r,cropCalendars[0],7,now,2026),null);
  assert.equal(summarize(monthlyRecord(2026,12,31),cropCalendars[0],12,now,2026),null);
  assert.equal(summarize({...r,days:r.days.filter((_,i)=>i!==3)},cropCalendars[0],9,now,2026),null);
});

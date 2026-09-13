import test from "node:test";
import assert from "node:assert/strict";
import {buildReleaseCalendar} from "../src/services/releaseCalendar.js";

test("official dates are exact and 2027 remains estimated",()=>{
  const calendar=buildReleaseCalendar("2026-09-12");
  assert.equal(calendar.endDate,"2027-09-12");
  const usda=calendar.events.find(e=>e.id==="usda-2026-10");
  assert.equal(usda.start,"2026-10-09");assert.equal(usda.confirmed,true);
  assert.equal(usda.time,"12:00 America/New_York");
  assert.equal(calendar.events.some(e=>e.id==="noaa-2026-09"),false);
  assert.ok(calendar.events.filter(e=>e.month.startsWith("2027")).every(e=>!e.confirmed));
  assert.ok(calendar.events.every(e=>e.end>=calendar.today&&e.start<=calendar.endDate));
});
test("schedule year is never blindly reused and old events expire",()=>{
  const calendar=buildReleaseCalendar("2028-01-01");
  assert.ok(calendar.events.every(e=>!e.confirmed));
  assert.equal(buildReleaseCalendar("2026-10-10").events.some(e=>e.id==="usda-2026-10"),false);
  const ids=calendar.events.map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
});

test("one-year window clamps leap day to the next February's last day",()=>{
  assert.equal(buildReleaseCalendar("2028-02-29").endDate,"2029-02-28");
});

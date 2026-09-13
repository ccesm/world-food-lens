import test from "node:test";
import assert from "node:assert/strict";
import {mobileClimateNavigation,mobileMoreNavigation,mobilePrimaryNavigation} from "../src/data/mobileNavigation.js";

test("mobile bottom navigation stays at five primary entries",()=>{
  assert.deepEqual(mobilePrimaryNavigation.map(item=>item.id),["home","risk","crops","climate","more"]);
  assert.equal(mobilePrimaryNavigation.length,5);
  assert.ok(mobilePrimaryNavigation.every(item=>item.label.zh&&item.label.en));
});

test("climate submenu links only to connected climate destinations",()=>{
  assert.deepEqual(mobileClimateNavigation.filter(item=>item.href).map(item=>item.href),["#enso-outlook","#seasonal-outlook","#local-crop-weather","#drought-monitor","#soil-moisture"]);
  assert.equal(mobileClimateNavigation.filter(item=>!item.href).length,0);
  assert.ok([...mobileClimateNavigation,...mobileMoreNavigation].every(item=>item.label.zh&&item.label.en));
});

import test from "node:test";
import assert from "node:assert/strict";
import {mobileClimateNavigation,mobileMoreNavigation,mobilePrimaryNavigation} from "../src/data/mobileNavigation.js";

test("mobile bottom navigation stays at five primary entries",()=>{
  assert.deepEqual(mobilePrimaryNavigation.map(item=>item.id),["home","risk","crops","climate","more"]);
  assert.equal(mobilePrimaryNavigation.length,5);
  assert.ok(mobilePrimaryNavigation.every(item=>item.label.zh&&item.label.en));
});

test("climate submenu separates available destinations from future evidence",()=>{
  assert.deepEqual(mobileClimateNavigation.filter(item=>item.href).map(item=>item.href),["#enso-outlook","#seasonal-outlook","#local-crop-weather"]);
  assert.deepEqual(mobileClimateNavigation.filter(item=>!item.href).map(item=>item.label.en),["Drought","Soil moisture"]);
  assert.ok([...mobileClimateNavigation,...mobileMoreNavigation].every(item=>item.label.zh&&item.label.en));
});

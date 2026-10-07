import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {validateRegistry,publishableOutputs,unpublishableOutputs,ruleForOutput} from "../src/services/evidenceRegistry.js";
import {METRICS} from "../src/services/cornSpatial.js";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const registry=JSON.parse(read("../src/data/evidenceRegistry.json"));
const clone=()=>structuredClone(registry);
const errorsAfter=mutate=>{const r=clone();mutate(r);return validateRegistry(r);};

test("the committed registry is valid",()=>{
  assert.deepEqual(validateRegistry(registry),[]);
});

test("every cited source exists in the Phase 4B-0 bibliography",()=>{
  const bibliography=read("../docs/PHASE4B0_CORN_AGRONOMIC_SPECIFICATION.md").split("## S. Verified bibliography")[1];
  const known=new Set([...bibliography.matchAll(/\*\*([EPMRUX]\d+)\.\*\*/g)].map(m=>m[1]));
  for(const rule of Object.values(registry.rules))
    for(const key of rule.literatureSources)assert.ok(known.has(key),`${rule.ruleId} cites unknown ${key}`);
});

test("every published Level C metric belongs to a reviewed or frozen rule",()=>{
  const allowed=publishableOutputs(registry);
  const published=JSON.parse(read("../public/data/corn-spatial.json"));
  const keys=new Set([...METRICS,...Object.keys(published.combined.weatherSummary??{}),
    ...published.states.flatMap(s=>Object.keys(s.weatherSummary??{}))]);
  for(const key of keys)assert.ok(allowed.has(key),`${key} has no reviewed rule`);
  const python=read("../scripts/corn_spatial.py").match(/^METRICS = \(([^)]*)\)/m)[1];
  for(const key of python.match(/"([^"]+)"/g).map(k=>k.slice(1,-1)))assert.ok(allowed.has(key),`Python metric ${key} has no reviewed rule`);
});

test("the heat screen artifact, when present, publishes only reviewed outputs",()=>{
  const allowed=publishableOutputs(registry);
  let heat;
  try{heat=JSON.parse(read("../public/data/corn-heat-screen.json"));}catch{return;}
  const keys=new Set([...Object.keys(heat.combined.heatSummary??{}),...heat.states.flatMap(s=>Object.keys(s.heatSummary??{}))]);
  for(const key of keys)assert.ok(allowed.has(key),`${key} has no reviewed rule`);
});

test("draft outputs do not appear in any published data file",()=>{
  // Later 4B-2 drafts have no named outputs yet; the guard applies as soon as they do.
  const blocked=[...unpublishableOutputs(registry)];
  const dir=new URL("../public/data/",import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith(".json"))){
    const body=readFileSync(new URL(name,dir),"utf8");
    for(const key of blocked)assert.ok(!body.includes(`"${key}"`),`${key} is published in ${name} while its rule is not reviewed`);
  }
});

test("shipped rules are reviewed and later 4B-2 rules remain drafts",()=>{
  assert.equal(ruleForOutput(registry,"edd29Window14DayCDay").reviewStatus,"reviewed");
  assert.equal(ruleForOutput(registry,"hotDays35Count").reviewStatus,"reviewed");
  for(const id of ["atmospheric_demand_vpd","heat_vpd_overlap","precipitation_anomaly","wetness_establishment_panel"])
    assert.equal(registry.rules[id].reviewStatus,"draft",id);
  assert.equal(ruleForOutput(registry,"precipitation14DayMm").reviewStatus,"reviewed");
  assert.equal(ruleForOutput(registry,"no-such-metric"),null);
});

test("co-occurrence inherits the 2.1 heat bases and VPD rules use the mapped-area denominator",()=>{
  const overlap=registry.rules.heat_vpd_overlap.parameters;
  assert.deepEqual(overlap.tmaxBaseC,registry.rules.heat_extreme_degree_days.parameters.baseC);
  assert.ok(!("eddBaseC" in overlap)&&!("baseC" in overlap));
  for(const id of ["atmospheric_demand_vpd","heat_vpd_overlap"])
    assert.match(registry.rules[id].denominator,/^mappedCornAreaM2\b/,id);
});

test("the validator rejects dishonest or inconsistent rules",()=>{
  const cases=[
    [r=>{r.rules.hot_day_tmax35.exactThresholdSupported=true;},/Tier C/],
    [r=>{r.rules.hot_day_tmax35.heuristicComponent=null;},/WFL heuristic/],
    [r=>{r.rules.hot_day_tmax35.parameters.thresholdC=34;},/thresholdC/],
    [r=>{r.rules.heat_extreme_degree_days.parameters.baseC=[29];},/baseC/],
    [r=>{r.rules.heat_extreme_degree_days.outputs.push("precipitation14DayMm");},/claimed by both/],
    [r=>{r.rules.atmospheric_demand_vpd.reviewedAt="2026-10-07";},/draft rules/],
    [r=>{r.rules.level_c_precipitation_total.reviewedAt=null;},/reviewedAt/],
    [r=>{r.rules.level_c_precipitation_total.reviewStatus="frozen";},/freezeIdentifier/],
    [r=>{r.rules.heat_extreme_degree_days.literatureSources=[];},/needs literature/],
    [r=>{r.rules.heat_extreme_degree_days.literatureSources=["Smith2020"];},/4B-0/],
    [r=>{r.rules.heat_extreme_degree_days.prohibitedClaims=[{zh:"只有中文"}];},/prohibitedClaims/],
    [r=>{delete r.rules.heat_extreme_degree_days.chronology.availableAsOf;},/chronology/],
    [r=>{r.rules.level_c_temperature_summary.outputs=[];},/must name its outputs/],
    [r=>{r.rules.renamed=r.rules.hot_day_tmax35;delete r.rules.hot_day_tmax35;},/ruleId must equal/],
  ];
  for(const [mutate,expected] of cases){
    const errors=errorsAfter(mutate);
    assert.ok(errors.some(e=>expected.test(e)),`expected ${expected} in ${JSON.stringify(errors)}`);
  }
  assert.deepEqual(validateRegistry({schemaVersion:2}),["schemaVersion must be 1"]);
});

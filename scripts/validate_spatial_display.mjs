/** Actual generated release checks, not a parallel frontend implementation. */
import fs from "node:fs";
import assert from "node:assert/strict";
import {validSpatial,selectSpatial,spatialHealth} from "../src/services/cornSpatial.js";
import {validateMonitorBundle} from "../src/services/automaticAlerts.js";
const feed=JSON.parse(fs.readFileSync(process.argv[2]));
assert.ok(validateMonitorBundle(feed));
const a=feed.analysis.cornSpatial,now=Date.parse(feed.generatedAt);
assert.ok(validSpatial(a,feed.release.id,feed.generatedAt));
const health=feed.dataHealth.datasets;
assert.equal(health.filter(h=>h.id.startsWith("cornSpatial")).length,31);
for(const s of a.states){
  const region=feed.analysis.cornPilot?.regions?.find(r=>r.id===s.state);
  const levelA=region?{...region,period:feed.analysis.cornPilot.period}:null;
  const selection=selectSpatial(s,levelA,health,{now});
  if(s.status==="ok")assert.equal(selection.method,"mapped-corn-area-weighted");
  else if(levelA?.weather&&health.find(h=>h.id===`weather/corn-${s.state}`)?.analysisUsable&&now-Date.parse(levelA.period.end)<=10*86400000)
    assert.equal(selection.method,"representative-point-fallback");
  else assert.equal(selection.method,"unavailable");
  const stale=selectSpatial(s,null,spatialHealth(a,{now:now+20*86400000}),{now:now+20*86400000});
  assert.equal(stale.method,"unavailable");
}
console.log("Actual release wire, Data Health, method labels and stale-data guard verified");

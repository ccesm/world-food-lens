/** Add informational spatial evidence AFTER alert evaluation. No alert migration. */
import {validSpatial,SPATIAL_METHOD} from "../src/services/cornSpatial.js";
import {addSpatialDataHealth} from "../src/services/centralDataHealth.js";
import {digest,weeklySummary} from "./revision_tracking.mjs";
import {validPhase2} from "../src/services/changeSet.js";

export function attachCornSpatial({spatial,monitor,previous=null}) {
  if(!spatial)return null; // Existing immutable releases remain compatible.
  if(!validSpatial(spatial))throw new Error("Invalid Level C artifact; refusing mislabeled spatial evidence");
  const a={...structuredClone(spatial),releaseId:monitor.release.id,evaluatedAt:monitor.generatedAt};
  for(const record of [...a.states.flatMap(s=>Object.values(s.records)),a.combined.record])
    record.metadata.extensions.release=monitor.release.id;
  addSpatialDataHealth(monitor.dataHealth,a,{now:Date.parse(monitor.generatedAt),release:monitor.release.id});
  monitor.analysis.cornSpatial=a;
  const prior=previous?.analysis?.cornSpatial;
  // Only window, geography/method vintage and availability/coverage state.
  // Ordinary numeric weather revisions are retained in provenance, not events.
  const project=x=>({period:x.period,methodVersion:x.methodVersion,gridVersion:x.gridVersion,
    states:x.states.map(s=>({state:s.state,status:s.status,annualKey:s.annualKey,
      coverageClass:s.coverage===null?"unknown":s.coverage>=1-1e-9?"complete":"partial",reasons:s.reasons}))});
  const version=x=>({datasetId:"cornSpatial",period:`${x.period.start}/${x.period.end}`,vintage:x.methodVersion,
    projectionHash:digest(project(x)),contentHash:x.analysisHash,revisionId:null});
  if(!prior||digest(project(prior))!==digest(project(a))) {
    const change={datasetId:"cornSpatial",type:!prior?"baseline":prior.period.end!==a.period.end?"new-observation":"structural-change",
      observation:null,field:"spatialWeatherCoverage",previous:prior?project(prior):null,current:project(a),
      previousVersion:prior?version(prior):null,currentVersion:version(a),absoluteDelta:null,percentDelta:null,direction:null,
      method:SPATIAL_METHOD,unit:"mapped corn area",eligible:false,reasons:[prior?"structural_change":"baseline_established"],releaseId:a.releaseId};
    change.id=`change-${digest(change)}`;
    monitor.analysis.changeSet.changes.push(change);
    if(monitor.analysis.journal.at(-1).changes!==monitor.analysis.changeSet.changes)monitor.analysis.journal.at(-1).changes.push(change);
  }
  const analysis=monitor.analysis;
  while(analysis.journal.length>1&&Buffer.byteLength(JSON.stringify(analysis.journal))>2_000_000)
    analysis.prunedThrough=analysis.journal.shift().evaluatedAt;
  analysis.weekly=weeklySummary(analysis.journal,analysis.evaluatedAt,analysis.startedAt,analysis.prunedThrough);
  delete analysis.integrity;analysis.integrity=digest(analysis);
  if(!validPhase2(analysis,a.releaseId,a.evaluatedAt))throw new Error("Invalid Level C change tracking");
  return a;
}

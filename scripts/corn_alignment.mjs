/** Additive integration: keep the frozen legacy builder and its results intact. */
import {buildAlignment,validAlignment,alignment} from "../src/services/cornAlignment.js";
import {digest,weeklySummary} from "./revision_tracking.mjs";
import {validPhase2} from "../src/services/changeSet.js";

export function attachCornAlignment({official,monitor,previous=null}) {
  const analysis=monitor.analysis,pilot=official?.cornPilot;
  const usable=id=>monitor.dataHealth.datasets.find(d=>d.id===id)?.analysisUsable===true&&
    analysis.changeSet.datasets.find(d=>d.datasetId===id)?.status!=="retained";
  const a=buildAlignment({production:pilot?.sources?.cornProduction,progress:[pilot?.sources?.cornProgress].filter(Boolean),
    weather:pilot?.weather,baselines:pilot?.baselines,end:analysis.cornPilot.period.end,
    evaluatedAt:monitor.generatedAt,releaseId:monitor.release.id,usable});
  if(!validAlignment(a,monitor.release.id,monitor.generatedAt))throw new Error("Invalid spatial-stage alignment artifact");
  analysis.cornAlignment=a;
  const prior=previous?.analysis?.cornAlignment;
  // Report structural/eligibility coverage transitions, not each weather day or
  // duplicate progress rows (those already participate in Phase 2).
  const projection=x=>({methodVersion:x.methodVersion,samplingVersion:x.samplingVersion,weightMethod:x.weightMethod,
    weightYear:x.weightYear,eligibility:x.eligibility,coverage:x.coverage,
    regions:x.regions.map(r=>({id:r.id,weight:r.productionWeight,mapping:r.mapping,stage:r.stageCovered,weather:r.weatherCovered,joint:r.joint}))});
  const version=x=>({datasetId:"cornAlignment",period:`${x.period.start}/${x.period.end}`,vintage:x.methodVersion,
    projectionHash:digest(projection(x)),contentHash:null,revisionId:null});
  if(!prior||digest(projection(prior))!==digest(projection(a))) {
    const change={datasetId:"cornAlignment",type:prior?"structural-change":"baseline",observation:null,field:"spatialStageCoverage",
      previous:prior?projection(prior):null,current:projection(a),previousVersion:prior?version(prior):null,currentVersion:version(a),
      absoluteDelta:null,percentDelta:null,direction:null,method:alignment.methodVersion,unit:"national production share",
      eligible:false,reasons:[prior?"structural_change":"baseline_established"],releaseId:a.releaseId};
    change.id=`change-${digest(change)}`;
    analysis.changeSet.changes.push(change);
    // The legacy builder's current entry holds the same changes array. Avoid
    // duplication if an implementation later chooses an independent array.
    const entry=analysis.journal.at(-1);
    if(entry.changes!==analysis.changeSet.changes)entry.changes.push(change);
  }
  // Retain the existing journal byte bound after adding the structural event.
  while(analysis.journal.length>1&&Buffer.byteLength(JSON.stringify(analysis.journal))>2_000_000)
    analysis.prunedThrough=analysis.journal.shift().evaluatedAt;
  analysis.weekly=weeklySummary(analysis.journal,analysis.evaluatedAt,analysis.startedAt,analysis.prunedThrough);
  delete analysis.integrity;analysis.integrity=digest(analysis);
  if(!validPhase2(analysis,a.releaseId,a.evaluatedAt))throw new Error("Invalid alignment change tracking");
  return a;
}

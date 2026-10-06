import {MARKET_RULES} from "../src/services/marketRules.js";
import {priceEvidence} from "../src/services/automaticAlerts.js";
// Informational crop rules are evaluated with the release-bound pilot artifact,
// never by the existing notification/alert lifecycle.
export {CORN_SIGNALS as CROP_SIGNAL_REGISTRY} from "./corn_pilot.mjs";

// A small named collection of functions, not a configurable rule language.
export const SIGNAL_REGISTRY = [
  ...["production","endingStocks"].map(field=>({id:`usda-${field}-revision`,version:"1",requiredDatasets:["usda"],
    name:field==="production"?{zh:"全球产量估计修订",en:"Global production estimate revision"}:
      {zh:"全球期末库存修订",en:"Global ending stocks revision"},
    method:"same-observation-delta/v1",threshold:{kind:"factual",condition:"non-zero comparable revision",validated:false},
    eligibility:"validated, current, same world/commodity/latest market year, unchanged coverage and unit; verified contributor baseline",
    field,notification:false})),
  ...MARKET_RULES.map(([dataset,field,zh,en,yellow,red])=>({id:`market/${dataset}/${field}`,version:"1",requiredDatasets:[dataset],
    name:{zh:`${zh}月度涨幅`,en:`${en} monthly price rise`},method:"adjacent-complete-month-change/v1",
    threshold:{kind:"heuristic",yellow,red,validated:false},
    eligibility:"existing priceEvidence: fresh validated source, source/units/headline checked, adjacent closed months",
    field,notification:true})),
];

export function evaluateSignals({official,monitor,changeSet,checkpoints,previous}) {
  const now=Date.parse(monitor.generatedAt),releaseId=monitor.release.id,results=[];
  const base=rule=>({ruleId:rule.id,ruleVersion:rule.version,name:rule.name,method:rule.method,threshold:rule.threshold,
    releaseId,evaluatedAt:monitor.generatedAt,notification:rule.notification});
  for(const rule of SIGNAL_REGISTRY) {
    if(rule.requiredDatasets[0]==="usda") {
      for(const change of changeSet.changes.filter(c=>c.datasetId==="usda"&&c.type==="revision"&&
        c.field===rule.field&&c.observation.geography==="world"&&c.observation.period===checkpoints.usda?.period)) {
        const obs=change.observation,checkpoint=checkpoints.usda;
        const coverage=checkpoint.structures[obs.id];
        // Phase 1 legacy display compatibility is not evidence for a NEW revision signal.
        const priorCoverage=previous?.analysis?.checkpoints?.usda?.structures[obs.id];
        const verified=c=>c&&["contributors","official-world"].includes(c.basis)&&Array.isArray(c.contributors);
        const eligible=change.eligible&&checkpoint.coverageVerified&&previous?.analysis?.checkpoints?.usda?.coverageVerified&&
          verified(coverage)&&verified(priorCoverage);
        results.push({...base(rule),id:`${rule.id}/${obs.id}`,observation:obs,changeId:change.id,
          state:eligible?"observed":"unverified",severity:null,eligible,
          reasons:eligible?[]:["coverage_incomplete",...change.reasons],
          inputs:[change.previousVersion,change.currentVersion],
          calculation:{previous:change.previous,current:change.current,absoluteDelta:change.absoluteDelta,
            percentDelta:change.percentDelta,direction:change.direction},coverage});
      }
      continue;
    }
    const dataset=rule.requiredDatasets[0];
    const availability=changeSet.datasets.find(d=>d.datasetId===dataset);
    const evidence=availability?.status!=="retained"?priceEvidence(official,dataset,rule.field,now):null;
    const alert=monitor.active.find(a=>a.id===rule.id);
    const oldEvents=new Set(previous?.events?.map(e=>e.id)??[]);
    const event=[...monitor.events].reverse().find(e=>!oldEvents.has(e.id)&&e.at===monitor.generatedAt&&e.alertId===rule.id);
    const prior=previous?.active?.find(a=>a.id===rule.id);
    const state=!evidence?"unverified":event?.type==="resolved"?"resolved":event?.type==="escalated"?"escalated":
      alert?.state==="active"?"active":"inactive";
    const rows=evidence?.record.data.monthly.slice(-2);
    results.push({...base(rule),id:rule.id,state,severity:evidence?alert?.severity??null:null,
      transition:evidence&&prior?.severity==="red"&&alert?.severity==="yellow"?"de-escalated":event?.type??null,
      eligible:!!evidence,reasons:evidence?[]:[availability?.reason??"insufficient_evidence"],
      // On lost evidence, point to the last accepted version but explicitly mark
      // no current calculation. Never relabel retained values as a fresh signal.
      inputs:checkpoints[dataset]?[checkpoints[dataset].version]:[],
      calculation:evidence?{period:evidence.period,previous:rows[0][rule.field],current:rows[1][rule.field],percentDelta:evidence.change}:null});
  }
  return results;
}

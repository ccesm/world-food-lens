// Evidence Basis Registry (Phase 4B-2.0; field meanings follow Phase 4B-0 §M).
// A rule states what a metric measures, what it may claim and what it must not.
// Only outputs of reviewed or frozen rules may appear in published data.

export const REVIEW_STATUSES=["draft","reviewed","frozen","superseded"];
export const PUBLISHABLE_STATUSES=["reviewed","frozen"];
export const EVIDENCE_TYPES=["empirical-field","meta-analysis","controlled-physiology","process-model","official-methodology","extension","wfl-design"];
export const EVIDENCE_STRENGTHS=["strong","moderate","limited","insufficient","not-applicable"];
export const THRESHOLD_CATEGORIES=["none","empirical","physiological","model","official","physical","measurement-convention","wfl-heuristic"];
export const TIERS=["A","B","C"];
const CHRONOLOGY=["sourcePublication","observedPeriod","revisionIdentity","availableAsOf"];
const TEXT_FIELDS=["methodologyVersion","phase","applicableCropStage","applicableRegion","managementDomain","proposedMetric",
  "units","temporalSupport","spatialSupport","missingnessPolicy","denominator","weightVintage","jointExposureAssumption"];

const text=v=>typeof v==="string"&&v.trim().length>0;
const bilingual=v=>v&&typeof v==="object"&&text(v.zh)&&text(v.en);
const isoDay=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const oneOf=(list,v)=>list.includes(v);

function ruleErrors(id,r){
  const e=[],bad=m=>e.push(`${id}: ${m}`);
  if(!r||typeof r!=="object")return [`${id}: rule is not an object`];
  if(r.ruleId!==id)bad("ruleId must equal its registry key");
  for(const f of TEXT_FIELDS)if(!text(r[f]))bad(`${f} must be a non-empty string`);
  if(!bilingual(r.concept))bad("concept needs zh and en");
  if(!bilingual(r.intendedClaim))bad("intendedClaim needs zh and en");
  if(!Array.isArray(r.prohibitedClaims)||!r.prohibitedClaims.length||!r.prohibitedClaims.every(bilingual))bad("prohibitedClaims needs at least one zh/en entry");
  if(!oneOf(REVIEW_STATUSES,r.reviewStatus))bad("unknown reviewStatus");
  if(!oneOf(EVIDENCE_TYPES,r.evidenceType))bad("unknown evidenceType");
  if(!oneOf(EVIDENCE_STRENGTHS,r.evidenceStrength))bad("unknown evidenceStrength");
  if(!oneOf(TIERS,r.conceptTier)||!oneOf(TIERS,r.implementationTier))bad("conceptTier and implementationTier must be A, B or C");
  if(!oneOf(THRESHOLD_CATEGORIES,r.thresholdCategory))bad("unknown thresholdCategory");
  if(typeof r.exactThresholdSupported!=="boolean")bad("exactThresholdSupported must be boolean");
  if(!(r.proposedRange===null||text(r.proposedRange)))bad("proposedRange must be null or text");
  if(!(r.heuristicComponent===null||text(r.heuristicComponent)))bad("heuristicComponent must be null or text");
  if(!r.parameters||typeof r.parameters!=="object"||Array.isArray(r.parameters))bad("parameters must be an object");
  for(const f of ["limitations","inputRequirements"])if(!Array.isArray(r[f])||!r[f].length||!r[f].every(text))bad(`${f} needs at least one entry`);
  if(!r.chronology||!CHRONOLOGY.every(k=>text(r.chronology[k])))bad(`chronology needs ${CHRONOLOGY.join(", ")}`);
  if(!Array.isArray(r.literatureSources)||!r.literatureSources.every(k=>/^[EPMRUX]\d+$/.test(k)))bad("literatureSources must be 4B-0 §S keys");
  else if(r.evidenceStrength!=="not-applicable"&&!r.literatureSources.length)bad("a rated evidence strength needs literature");
  if(!Array.isArray(r.outputs)||!r.outputs.every(text))bad("outputs must be a list of metric keys");

  // Review lifecycle.
  const published=oneOf(PUBLISHABLE_STATUSES,r.reviewStatus);
  if(published&&!isoDay(r.reviewedAt))bad("reviewed/frozen rules need reviewedAt (YYYY-MM-DD)");
  if(r.reviewStatus==="draft"&&r.reviewedAt!==null)bad("draft rules must not carry reviewedAt");
  if(r.reviewStatus==="frozen"?!text(r.freezeIdentifier):r.freezeIdentifier!==null)bad("freezeIdentifier is required for frozen rules and only for them");
  if(published&&!r.outputs?.length)bad("a publishable rule must name its outputs");

  // Honesty constraints from 4B-0 §O/§P.
  if(r.implementationTier==="C"&&r.exactThresholdSupported)bad("a Tier C implementation cannot claim a supported exact threshold");
  if(r.thresholdCategory==="wfl-heuristic"&&(r.implementationTier!=="C"||!text(r.heuristicComponent)||r.exactThresholdSupported))
    bad("a WFL heuristic must be Tier C, unsupported as exact, and name its heuristic component");

  // Output names that embed a number must agree with the declared parameter.
  const p=r.parameters||{};
  if(Number.isFinite(p.thresholdC)&&!r.outputs?.every(k=>k.includes(String(p.thresholdC))))bad("every output must embed parameters.thresholdC");
  if(Array.isArray(p.baseC)){
    const names=r.outputs||[];
    if(!p.baseC.every(b=>names.some(k=>k.includes(String(b))))||names.length!==p.baseC.length)bad("outputs must match parameters.baseC one-to-one");
  }
  return e;
}

export function validateRegistry(registry){
  const errors=[];
  if(!registry||registry.schemaVersion!==1)return ["schemaVersion must be 1"];
  if(!text(registry.registryVersion))errors.push("registryVersion is required");
  const rules=registry.rules;
  if(!rules||typeof rules!=="object"||!Object.keys(rules).length)return [...errors,"rules must be a non-empty object"];
  const owner=new Map();
  for(const [id,rule] of Object.entries(rules)){
    errors.push(...ruleErrors(id,rule));
    for(const key of rule?.outputs||[]){
      if(owner.has(key))errors.push(`${key}: claimed by both ${owner.get(key)} and ${id}`);
      else owner.set(key,id);
    }
  }
  return errors;
}

export function ruleForOutput(registry,key){
  return Object.values(registry.rules).find(r=>r.outputs.includes(key))??null;
}

export function publishableOutputs(registry){
  return new Set(Object.values(registry.rules).filter(r=>PUBLISHABLE_STATUSES.includes(r.reviewStatus)).flatMap(r=>r.outputs));
}

export function unpublishableOutputs(registry){
  return new Set(Object.values(registry.rules).filter(r=>!PUBLISHABLE_STATUSES.includes(r.reviewStatus)).flatMap(r=>r.outputs));
}

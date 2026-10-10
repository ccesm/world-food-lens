// G1.0 Global Crop Supply contract helpers (docs/G1_SUPPLY_CONTRACT.md).
// Deterministic, side-effect free. No production PSD parsing lives here.
import contract from "../data/globalSupplyContract.json" with {type:"json"};

export const CONTRACT=contract;
export const COMMODITIES=Object.keys(contract.commodities);
export const METRICS=Object.fromEntries(contract.metrics.map(m=>[m.id,m]));
export const STATUSES=Object.keys(contract.statusTaxonomy);
const finite=Number.isFinite;

export function commodityId(id){
  if(!COMMODITIES.includes(id))throw new Error(`Unknown commodity: ${id}`);
  return id;
}

/** Geography type comes from the registry by source code, never from a display name. */
export function psdGeography(code,displayName){
  if(typeof code!=="string"||!/^[A-Z0-9]{2}$/.test(code))throw new Error("USDA PSD geography codes are two characters");
  const id=`usda-psd:${code}`,entry=contract.geography.registry[id];
  return {id,type:entry?.type??"country",sourceId:code,isoCode:entry?.isoCode??null,
    name:entry?.name??{zh:null,en:displayName??null}};
}
export const WORLD=Object.freeze({id:"wfl:world",type:"world",sourceId:null,isoCode:null,
  name:contract.geography.registry["wfl:world"].name,derived:true});

/** PSD market-year identity: keep the source ID, add a display label, never assume a calendar window. */
export function psdMarketingYear(sourceId){
  const year=Number(sourceId);
  if(!Number.isInteger(year)||year<1900||year>2100)throw new Error("Invalid PSD market year");
  return {system:"usda-psd",sourceId:String(year),label:`${year}/${String((year+1)%100).padStart(2,"0")}`,startMonth:null};
}

export function observationId({commodity,geography,marketingYear,metric}){
  commodityId(commodity);
  if(!METRICS[metric])throw new Error(`Unknown metric: ${metric}`);
  return `g1:${commodity}:${geography.id}:${marketingYear.sourceId}:${metric}`;
}
export const revisionId=(obsId,source,previous,current)=>`${obsId}@${source}:${previous}->${current}`;

/** Validate one PSD source value against the contract. Units must match exactly; no silent conversion. */
export function normalizePsdValue(metricId,{attributeId,unit},raw){
  const m=METRICS[metricId];
  if(!m||m.kind!=="source")throw new Error(`Not a source metric: ${metricId}`);
  if(attributeId!==m.psd.attributeId||unit!==m.psd.unit)return {status:"unavailable",reason:"unit_or_attribute_changed"};
  if(raw===null||raw===undefined||(typeof raw==="string"&&!raw.trim()))return {status:"missing",value:null};
  if(typeof raw!=="string"&&typeof raw!=="number")return {status:"unavailable",reason:"not_numeric"};
  const value=Number(raw);
  if(!finite(value))return {status:"unavailable",reason:"not_numeric"};
  if(value<0){
    if(m.negativeSourceValues==="flag")return {status:"ok",value,flags:["negative-source-value"]};
    return {status:"unavailable",reason:"impossible_negative"};
  }
  return {status:"ok",value,flags:value===0?["source-zero-filled"]:[]};
}

/** Yield with zero area is not-applicable; nonzero area with zero yield is flagged. */
export function yieldStatus(yieldValue,area){
  if(area===0)return {status:"not-applicable",value:null};
  if(yieldValue===0&&area>0)return {status:"ok",value:0,flags:["zero-yield-with-area"]};
  return {status:"ok",value:yieldValue,flags:[]};
}

const known=v=>v&&v.status==="ok"&&finite(v.value);
export function stocksToUse(endingStocks,domesticUse){
  if(!known(endingStocks)||!known(domesticUse)||domesticUse.value<=0)return {status:"unknown",value:null};
  return {status:"ok",value:endingStocks.value/domesticUse.value*100};
}

/** Release-to-release revision of the SAME observation. No previous release -> unknown, never 0. */
export function revision(current,previous){
  const currentEstimate=known(current)?current.value:null,previousEstimate=known(previous)?previous.value:null;
  if(currentEstimate===null||previousEstimate===null)
    return {currentEstimate,previousEstimate,revision:null,revisionPct:null,status:"unknown"};
  const delta=currentEstimate-previousEstimate;
  return {currentEstimate,previousEstimate,revision:delta,revisionPct:previousEstimate===0?null:delta/previousEstimate*100,
    status:previousEstimate===0?"unknown":"ok"};
}
/** Year-over-year change within ONE release. Separate concept, separate fields. */
export function yoy(current,prior){
  if(!known(current)||!known(prior))return {yoyChange:null,yoyPct:null,status:"unknown"};
  const delta=current.value-prior.value;
  return {yoyChange:delta,yoyPct:prior.value===0?null:delta/prior.value*100,status:prior.value===0?"unknown":"ok"};
}

/** Metric-level direction. deadZonePct null (draft) -> unknown. Boundary is inclusive-stable. */
export function metricDirection(metricId,pct,deadZonePct){
  const m=METRICS[metricId];
  if(!m)throw new Error(`Unknown metric: ${metricId}`);
  if(!m.directionEligible||m.polarity==="contextual")return "not-applicable";
  if(!finite(pct)||!finite(deadZonePct)||deadZonePct<0)return "unknown";
  if(Math.abs(pct)<=deadZonePct)return "stable";
  if(m.polarity!=="lower-is-tightening")throw new Error(`Unsupported polarity: ${m.polarity}`);
  return pct<0?"tightening":"easing";
}

/** DRAFT aggregate rule (contract interpretationRules). Counts only; lists every input. */
export function aggregateSupplyStatus(directions){
  const rule=contract.interpretationRules.find(r=>r.ruleId==="g1_aggregate_supply_status");
  const core=rule.parameters.coreMetrics,evidence=core.map(metric=>({metric,
    direction:["tightening","stable","easing"].includes(directions[metric])?directions[metric]:"unknown"}));
  const count=d=>evidence.filter(e=>e.direction===d).length;
  const counts={tightening:count("tightening"),stable:count("stable"),easing:count("easing"),unknown:count("unknown")};
  let status="stable";
  if(counts.unknown||evidence.some(e=>e.direction==="not-applicable"))status="unknown";
  else if(counts.tightening&&counts.easing)status="mixed";
  else if(counts.tightening)status="tightening";
  else if(counts.easing)status="easing";
  return {status,counts,evidence,ruleStatus:rule.status};
}

/** Compare only canonical, same-observation/same-release evidence at the best known tier.
 * Lower-tier and non-current evidence remains attached, never silently overwrites Tier 1.
 * These contract helpers are not wired to production in G1.0.
 */
export function resolveSources(observations){
  const values=observations.filter(o=>known(o));
  if(!values.length)return {status:observations.length?"unknown":"missing",observations,preferred:[]};
  if(values.some(o=>![1,2,3].includes(o.sourceTier)||!o.source))
    return {status:"unknown",reason:"source_priority_unknown",observations,preferred:[]};
  const tier=Math.min(...values.map(o=>o.sourceTier));
  const preferred=values.filter(o=>o.sourceTier===tier),lowerPriority=values.filter(o=>o.sourceTier!==tier);
  const fields=["observationId","unit","basis","comparisonPeriod","sourceRelease"];
  if(preferred.some(o=>fields.some(f=>typeof o[f]!=="string"||!o[f].trim())||!releaseMonth(o.sourceRelease)))
    return {status:"unknown",reason:"comparability_metadata_missing",observations,preferred,lowerPriority};
  if(fields.some(f=>new Set(preferred.map(o=>o[f])).size!==1))
    return {status:"unknown",reason:"not_comparable",observations,preferred,lowerPriority};
  // Distinct editions from one source within a month are revisions, not independent conflicting sources.
  if(preferred.some((o,i)=>preferred.some((p,j)=>i!==j&&o.source===p.source&&o.value!==p.value)))
    return {status:"unknown",reason:"same_source_revision_unordered",observations,preferred,lowerPriority};
  return {status:new Set(preferred.map(o=>o.value)).size>1?"conflicting":"ok",observations,preferred,lowerPriority};
}

const releaseMonth=v=>typeof v==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const sequence=v=>Number.isSafeInteger(v)&&v>=0;

/** Pure accept/quarantine decision. Retrieval/cache timestamps never order scientific versions. */
export function assessReleaseVersion(incoming,previous){
  const valid=v=>v&&["observationId","source","sourceDataset"].every(f=>typeof v[f]==="string"&&v[f].trim())&&
    releaseMonth(v.sourceRelease)&&hash(v.rawFileHash);
  const reject=reason=>({accepted:false,reason,retained:previous??null});
  if(!valid(incoming))return reject("invalid_incoming_version");
  if(!previous)return {accepted:true,kind:"first-publication"};
  if(!valid(previous))return reject("invalid_previous_version");
  if(["observationId","source","sourceDataset"].some(f=>incoming[f]!==previous[f]))return reject("observation_identity_mismatch");
  if(incoming.sourceRelease<previous.sourceRelease)return reject("publication_regression");
  if(incoming.sourceRelease>previous.sourceRelease)return {accepted:true,kind:"new-publication"};
  if(sequence(incoming.revisionSequence)&&sequence(previous.revisionSequence)&&
    incoming.revisionOrderSource==="source-authenticated"&&previous.revisionOrderSource==="source-authenticated"&&
    incoming.revisionSequence<previous.revisionSequence)return reject("same_vintage_revision_regression");
  if(incoming.rawFileHash===previous.rawFileHash)return {accepted:true,kind:"unchanged"};
  // Only a source-authenticated edition order can authorize a same-month correction.
  // A fetch counter, HTTP timestamp or content hash alone is not that evidence.
  if(incoming.revisionOrderSource!=="source-authenticated"||previous.revisionOrderSource!=="source-authenticated"||
    !sequence(incoming.revisionSequence)||!sequence(previous.revisionSequence))return reject("same_vintage_revision_unordered");
  if(incoming.revisionSequence<=previous.revisionSequence)return reject("same_vintage_revision_regression");
  return {accepted:true,kind:"same-vintage-revision"};
}

/** Per-metric geography presence against an explicit, reviewed market-year baseline.
 * Not an aggregation/parser: no sums, no extrapolation, no inferred country weights.
 * EU membership must be supplied as reviewed source IDs, not guessed from names.
 */
export function assessGeographyCoverage(rows,{expectedIds,marketYear,euMemberIds=[]}={}){
  if(!Array.isArray(expectedIds)||!expectedIds.length||new Set(expectedIds).size!==expectedIds.length||
    !Number.isInteger(marketYear)||expectedIds.some(id=>typeof id!=="string"||!/^usda-psd:[A-Z0-9]{2}$/.test(id)))
    return {status:"unknown",reason:"coverage_baseline_missing_or_invalid"};
  const activeEu=marketYear>=1999?"usda-psd:E4":"usda-psd:E2";
  const inactiveEu=marketYear>=1999?"usda-psd:E2":"usda-psd:E4";
  const excluded=id=>id===inactiveEu||(marketYear<2016&&id==="usda-psd:UK")||
    (expectedIds.includes(activeEu)&&euMemberIds.includes(id));
  if(expectedIds.some(excluded))return {status:"unknown",reason:"coverage_baseline_overlapping"};
  const ids=rows.map(r=>r.geography?.id),duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
  const excludedIds=[...new Set(ids.filter(excluded))].sort();
  const unexpectedIds=[...new Set(ids.filter(id=>!excluded(id)&&!expectedIds.includes(id)))].sort();
  const presentIds=expectedIds.filter(id=>rows.some(r=>r.geography?.id===id&&known(r))).sort();
  const missingIds=expectedIds.filter(id=>!presentIds.includes(id)).sort();
  const complete=!missingIds.length&&!unexpectedIds.length&&!duplicates.length;
  return {status:complete?"ok":"unavailable",reason:complete?null:"coverage_incomplete",expectedCount:expectedIds.length,
    presentCount:presentIds.length,presentIds,missingIds,excludedIds,unexpectedIds,duplicateIds:[...new Set(duplicates)].sort(),
    // This is row/identity coverage, NOT production coverage.
    geographyCountCoverage:presentIds.length/expectedIds.length};
}

/** Validate a global-supply index: one status PER commodity, no single file-level status. */
export function validateSupplyIndex(index){
  const errors=[];
  if(index?.contractVersion!==contract.contractVersion)errors.push("contractVersion mismatch");
  if("status" in (index??{}))errors.push("a file-level status is not allowed; status is per commodity");
  const entries=Object.entries(index?.commodities??{});
  if(!entries.length)errors.push("commodities required");
  for(const [id,c] of entries){
    if(!COMMODITIES.includes(id))errors.push(`${id}: unknown commodity`);
    if(!["ok","stale","unavailable"].includes(c?.status))errors.push(`${id}: status must be ok, stale or unavailable`);
    if(c?.status!=="unavailable"){
      for(const f of contract.provenance.fields)if(!(f in (c?.provenance??{})))errors.push(`${id}: provenance.${f} missing`);
    } else if(!c?.reason)errors.push(`${id}: unavailable needs a reason`);
  }
  return errors;
}

export function validateContract(c=contract){
  const errors=[];
  for(const m of c.metrics){
    if(!["source","derived"].includes(m.kind))errors.push(`${m.id}: kind`);
    if(!["lower-is-tightening","contextual"].includes(m.polarity))errors.push(`${m.id}: polarity`);
    if(m.polarity==="contextual"&&m.directionEligible)errors.push(`${m.id}: contextual metrics cannot be direction-eligible`);
    if(m.kind==="source"&&!(m.psd?.attributeId&&m.psd?.unit))errors.push(`${m.id}: source mapping`);
    if(m.kind==="derived"&&!(m.formula&&m.denominator))errors.push(`${m.id}: derived needs formula and denominator`);
  }
  for(const r of c.interpretationRules){
    if(r.tier!=="C")errors.push(`${r.ruleId}: interpretation heuristics are Tier C`);
    if(!["draft","reviewed","frozen"].includes(r.status))errors.push(`${r.ruleId}: status`);
    if(!r.claim?.zh||!r.claim?.en||!r.prohibited?.length)errors.push(`${r.ruleId}: bilingual claim and prohibitions`);
  }
  const ids=c.metrics.map(m=>m.id);
  if(new Set(ids).size!==ids.length)errors.push("duplicate metric ids");
  const core=c.interpretationRules.find(r=>r.ruleId==="g1_aggregate_supply_status")?.parameters.coreMetrics;
  if(!core||JSON.stringify(core)!==JSON.stringify(c.metrics.filter(m=>m.inAggregateCore).map(m=>m.id)))
    errors.push("aggregate core flags and rule disagree");
  if(c.metrics.find(m=>m.id==="stocksToUse")?.inAggregateCore)errors.push("stocksToUse duplicates endingStocks in core");
  return errors;
}

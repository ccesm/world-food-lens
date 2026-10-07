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
  if(raw===null||raw===undefined||raw==="")return {status:"missing",value:null};
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
  const core=rule.parameters.coreMetrics,evidence=core.map(metric=>({metric,direction:directions[metric]??"unknown"}));
  const count=d=>evidence.filter(e=>e.direction===d).length;
  const counts={tightening:count("tightening"),stable:count("stable"),easing:count("easing"),unknown:count("unknown")};
  let status="stable";
  if(counts.unknown||evidence.some(e=>e.direction==="not-applicable"))status="unknown";
  else if(counts.tightening&&counts.easing)status="mixed";
  else if(counts.tightening)status="tightening";
  else if(counts.easing)status="easing";
  return {status,counts,evidence,ruleStatus:rule.status};
}

/** Same observation from several sources: expose disagreement, never choose silently. */
export function resolveSources(observations){
  const values=observations.filter(o=>o.status==="ok");
  if(values.length<=1)return {status:values.length?"ok":"missing",observations};
  const distinct=new Set(values.map(o=>o.value));
  return {status:distinct.size>1?"conflicting":"ok",observations};
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
  return errors;
}

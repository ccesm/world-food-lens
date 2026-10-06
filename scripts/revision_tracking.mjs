import {createHash} from "node:crypto";
import {validPhase2} from "../src/services/changeSet.js";
import {evaluateSignals} from "./signal_registry.mjs";
import {buildCornPilot,cornSignals} from "./corn_pilot.mjs";

export const stableJSON = value => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const digest = value => createHash("sha256").update(stableJSON(value)).digest("hex");
const same = (a,b) => stableJSON(a) === stableJSON(b);
const DAY = 86400000;
const KEYS = ["usda", "fao", "worldBank", "enso", "cornProduction", "cornProgress"];
const finite = Number.isFinite;
const quantities = row => ({production:row.production, consumption:row.consumption,
  endingStocks:row.endingStocks, ratio:row.endingStocks / row.consumption * 100});
const validQuantities = row => [row.production,row.consumption,row.endingStocks].every(finite) &&
  row.production>0 && row.consumption>0 && row.endingStocks>=0;
const healthView = h => ({retrieval:h.retrieval,validation:h.validation,freshness:h.freshness,
  analysisUsable:h.analysisUsable,reasons:h.reasons,cache:h.metadata?.cache?.startsWith("retained") ? "retained" : "accepted"});

/** Compact accepted projections, not a second source adapter. Global USDA history
 * is retained; contributor detail is limited to the latest two marketing years.
 * Monthly revision comparison covers 24 months; older source history is still
 * bound by Git/release inputs, not duplicated in each checkpoint. */
export function projectDataset(id, record) {
  const data=record.data, rows={}, structures={};
  let period=record.source?.period??data.issuedAt, vintage=null;
  const add=(commodity,geography,period,values,structure)=>{
    if(Object.values(values).some(v=>typeof v==="number"&&!finite(v)))throw new Error("Invalid projection");
    const key=[commodity,geography,period].join("|");
    if(rows[key])throw new Error("Duplicate observation");
    rows[key]={commodity,geography,period,values};
    structures[key]=structure;
  };
  if(id==="usda") {
    period=data.latestPeriod;vintage=data.releasePeriod;
    if(!/^\d{4}-\d{2}$/.test(vintage??""))throw new Error("Missing USDA vintage");
    for(const [commodity,grain] of Object.entries(data.grains??{wheat:data})) {
      if(grain.releasePeriod!==vintage||grain.latestPeriod!==period)throw new Error("Misaligned USDA vintage");
      for(const row of grain.history) {
        if(!validQuantities(row))throw new Error("Incomplete USDA quantities");
        const c=grain.coverage?.[row.year];
        const structure={unit:record.source?.unit??null,basis:c?.basis??"unknown",
          contributors:c?.contributors?.map(x=>x.id).sort()??null,count:c?.count??row.countryAreaCount??null};
        add(commodity,"world",row.year,quantities(row),structure);
        if(row.excludingChina) {
          if(!validQuantities(row.excludingChina))throw new Error("Invalid ex-China quantities");
          add(commodity,"world-ex-China",row.year,quantities(row.excludingChina),{...structure,chinaId:c?.chinaId??null});
        }
        if(grain.history.slice(-2).some(r=>r.year===row.year)) for(const country of c?.contributors??[]) {
          if(!validQuantities(country)) {
            // Zero-producing/import-only contributors still have factual quantities;
            // undefined stock/use ratios are null, never division by zero.
            if(![country.production,country.consumption,country.endingStocks].every(v=>finite(v)&&v>=0))throw new Error("Invalid country values");
          }
          add(commodity,country.id,row.year,{production:country.production,consumption:country.consumption,
            endingStocks:country.endingStocks,ratio:country.consumption>0?country.endingStocks/country.consumption*100:null},
          {unit:structure.unit,basis:"contributor"});
        }
      }
    }
  } else if(id==="cornProduction") {
    period=data.year;vintage=data.publishedDate;
    for(const [geography,row] of Object.entries({...data.regions,US:data.national}))
      for(const [field,unit] of [["production",data.unit],["harvestedArea",data.areaUnit],["yield",data.yieldUnit]])
        add(`maize-${field}`,geography,period,{value:row[field]},{unit,basis:"NASS-annual-grain"});
  } else if(id==="cornProgress") {
    period=data.weekEnding;vintage=data.publishedDate;
    for(const report of data.history)for(const [geography,row] of Object.entries(report.regions)) {
      add("maize-progress",geography,report.weekEnding,row.progress,{unit:"percent",basis:"NASS-cumulative-progress"});
      if(row.condition)add("maize-condition",geography,report.weekEnding,row.condition,{unit:"percent",basis:"NASS-condition-shares"});
    }
  } else if(id==="enso") {
    period=data.issuedAt;vintage=data.issuedAt;
    for(const row of data.forecasts) add("enso","pacific",row.startMonth,
      {elNino:row.elNino,laNina:row.laNina,neutral:row.neutral,roniPercentiles:row.roniPercentiles},
      {unit:"percent / RONI °C",window:"three-month"});
    // Preserve the original evidence; never turn prose into a probability here.
    add("advisory","pacific",data.issuedAt,{phase:data.phase,strengthEvidence:data.strengthEvidence??null}, {unit:"official-evidence"});
  } else {
    for(const row of data.monthly.slice(-24)) {
      const fields=id==="fao"?["fao"]:Object.keys(row).filter(k=>k!=="month").sort();
      for(const field of fields) {
        if(!finite(row[field])||row[field]<=0)throw new Error("Incomplete monthly value");
        add(field,"benchmark",row.month,{value:row[field]}, {unit:record.source?.unit??null});
      }
    }
    if(!Object.values(rows).some(r=>r.period===period))throw new Error("Monthly period mismatch");
    if(data.monthly.at(-1).month!==period)throw new Error("Monthly header is not the latest observation");
  }
  const coverageVerified=id==="usda"?Object.values(data.grains??{wheat:data}).every(g=>
    ["baseline-established","compared"].includes(g.coverageAssessment?.state)&&!!g.coverage):null;
  const projection={id,period,vintage,rows,structures,coverageVerified};
  return {...projection,version:{datasetId:id,period,vintage,projectionHash:digest(projection),
    contentHash:record.metadata?.version?.contentHash??null,revisionId:record.metadata?.version?.revisionId??null}};
}

function compare(id,old,current,eligible,releaseId) {
  const changes=[];
  const make=(type,observation,field,before,after,comparable=true)=>{
    const numeric=comparable&&finite(before)&&finite(after);
    const item={datasetId:id,type,observation,field,previous:before,current:after,
      previousVersion:old?.version??null,currentVersion:current.version,
      absoluteDelta:numeric?after-before:null,percentDelta:numeric&&before!==0?(after-before)/Math.abs(before)*100:null,
      direction:numeric?(after>before?"up":after<before?"down":"unchanged"):null,
      method:field==="ratio"?"stock-to-use/v1":"source-value/v1",
      unit:field==="ratio"?"%":current.structures[observation?.id]?.unit??null,
      eligible:eligible&&comparable,reasons:type==="baseline"?["baseline_established"]:
        comparable?eligible?[]:["insufficient_evidence"]:["structural_change"],releaseId};
    item.id=`change-${digest(item)}`;changes.push(item);
  };
  if(!old) {make("baseline",null,null,null,current.period,false);return changes;}
  if(current.vintage!==old.vintage) make("new-publication-vintage",null,"vintage",old.vintage,current.vintage);
  for(const [key,row] of Object.entries(current.rows).sort(([a],[b])=>a.localeCompare(b))) {
    const prior=old.rows[key],obs={id:key,commodity:row.commodity,geography:row.geography,period:row.period};
    const structural=!!prior&&!same(old.structures[key],current.structures[key]);
    if(structural)make("structural-change",obs,"structure",old.structures[key],current.structures[key],false);
    for(const [field,value] of Object.entries(row.values)) {
      if(prior&&same(prior.values[field],value))continue;
      const peers=Object.values(old.rows).filter(r=>r.commodity===row.commodity&&r.geography===row.geography);
      const priorHorizon=peers.map(r=>r.period).sort().at(-1);
      const type=structural||prior&&!Object.hasOwn(prior.values,field)?"structural-change":!prior?
        (priorHorizon&&row.period>priorHorizon?"new-observation":"structural-change"):"revision";
      make(type,obs,field,prior?.values[field]??null,value,type!=="structural-change");
    }
    if(prior)for(const field of Object.keys(prior.values))if(!Object.hasOwn(row.values,field))
      make("structural-change",obs,field,prior.values[field],null,false);
  }
  for(const [key,row] of Object.entries(old.rows))if(!current.rows[key]) {
    if(id==="cornProduction"&&row.period<current.period)continue;
    if(id==="cornProgress"&&row.period<Object.values(current.rows).map(r=>r.period).sort()[0])continue;
    const start=new Date(`${current.period.slice(0,7)}-01T00:00:00Z`);
    if(["fao","worldBank"].includes(id)) {
      start.setUTCMonth(start.getUTCMonth()-23);
      if(row.period<start.toISOString().slice(0,7))continue;
    }
    // A two-year contributor detail window rolls forward by design. Global
    // history is never silently dropped; missing in-window entities are structural.
    const horizon=Number(current.period.slice(0,4))-1;
    if(id==="usda"&&row.geography.startsWith("usda-psd:")&&+row.period.slice(0,4)<horizon)continue;
    // The previous ENSO advisory is archived in the delta; issue rollover isn't lost geography.
    if(id==="enso"&&row.commodity==="advisory"&&row.period<current.period)continue;
    // ENSO rolling forecast seasons naturally leave the published window.
    if(id==="enso"&&row.commodity==="enso"&&row.period<Object.values(current.rows).filter(r=>r.commodity==="enso")[0]?.period)continue;
    make("structural-change",{id:key,commodity:row.commodity,geography:row.geography,period:row.period},"observation",row.values,null,false);
  }
  return changes;
}

export function weeklySummary(entries,evaluatedAt,startedAt,prunedThrough=null) {
  const start=new Date(Date.parse(evaluatedAt)-7*DAY).toISOString();
  const included=entries.filter(e=>e.evaluatedAt>start&&e.evaluatedAt<=evaluatedAt);
  return {start,end:evaluatedAt,complete:startedAt<=start&&(!prunedThrough||prunedThrough<=start),
    releases:included.map(e=>e.releaseId),
    newObservations:included.flatMap(e=>e.changes.filter(c=>c.type==="new-observation").map(c=>c.id)),
    officialRevisions:included.flatMap(e=>e.changes.filter(c=>c.type==="revision").map(c=>c.id)),
    publications:included.flatMap(e=>e.changes.filter(c=>c.type==="new-publication-vintage").map(c=>c.id)),
    structuralChanges:included.flatMap(e=>e.changes.filter(c=>c.type==="structural-change").map(c=>c.id)),
    signals:included.flatMap(e=>e.signals.map(s=>({releaseId:e.releaseId,id:s.id,state:s.state}))),
    healthChanges:included.flatMap(e=>e.changes.filter(c=>c.type==="health-only").map(c=>c.id)),
    unavailableEvidence:included.flatMap(e=>e.unavailable.map(u=>({releaseId:e.releaseId,...u})))};
}

/** Pure given caches, the already evaluated alert result, previous snapshot, and
 * release identity. No API calls, wall clock, file writes, or notifications. */
export function buildPhase2({official,enso,monitor,previous=null}) {
  const releaseId=monitor.release?.id,evaluatedAt=monitor.generatedAt;
  if(!releaseId||!finite(Date.parse(evaluatedAt)))throw new Error("Phase 2 requires a bound release");
  const old=previous?.analysis;
  if(old) {
    const {integrity,...body}=old;
    if(!validPhase2(old,previous.release?.id,previous.generatedAt)||digest(body)!==integrity)
      throw new Error("Invalid revision history; refusing to discard checkpoint");
    if(old.evaluatedAt>evaluatedAt)throw new Error("Revision history is from the future");
  }
  const checkpoints=structuredClone(old?.checkpoints??{}),health={},changes=[],datasets=[],unavailable=[];
  for(const h of monitor.dataHealth.datasets) {
    health[h.id]=healthView(h);
    if(old?.health[h.id]&&!same(old.health[h.id],health[h.id])) {
      const item={datasetId:h.id,type:"health-only",previous:old.health[h.id],current:health[h.id],releaseId};
      changes.push({...item,id:`change-${digest(item)}`});
    }
    if(!h.analysisUsable)unavailable.push({datasetId:h.id,reasons:h.reasons});
  }
  for(const id of KEYS) {
    const h=monitor.dataHealth.datasets.find(r=>r.id===id),record=id==="enso"?enso:id.startsWith("corn")?official?.cornPilot?.sources?.[id]:official?.sources?.[id];
    const prior=checkpoints[id];
    let current=null,reason=null;
    if(h?.displayUsable&&h.retrieval==="ok"&&h.validation==="passed") {
      try {current=projectDataset(id,record);}catch {reason="semantic_validation_failed";}
    } else reason=h?.reasons[0]??"insufficient_evidence";
    if(current&&prior&&(current.period<prior.period||current.vintage&&prior.vintage&&current.vintage<prior.vintage))reason="publication_regression";
    if(current?.vintage&&current.vintage>evaluatedAt.slice(0,current.vintage.length))reason="publication_regression";
    if(current&&["fao","worldBank"].includes(id)&&current.period>=evaluatedAt.slice(0,7))reason="semantic_validation_failed";
    if(id==="usda"&&record?.metadata&&!h?.analysisUsable&&h?.reasons.includes("coverage_incomplete"))reason="coverage_incomplete";
    if(reason||!current) {
      datasets.push({datasetId:id,status:"retained",reason,version:prior?.version??null});
      const unavailableRow=unavailable.find(r=>r.datasetId===id);
      if(unavailableRow)unavailableRow.reasons=[...new Set([...unavailableRow.reasons,reason])];
      else unavailable.push({datasetId:id,reasons:[reason]});
      continue;
    }
    const delta=compare(id,prior,current,h.analysisUsable,releaseId);
    changes.push(...delta);checkpoints[id]=current;
    const outsideProjection=prior&&prior.version.contentHash&&current.version.contentHash&&
      prior.version.contentHash!==current.version.contentHash&&!delta.length;
    datasets.push({datasetId:id,status:!prior?"baseline":delta.length?"changed":outsideProjection?"outside-tracked-scope":"no-change",
      reason:null,version:current.version});
  }
  const changeSet={releaseId,evaluatedAt,datasets,changes,unavailable};
  const cornPilot=buildCornPilot({official,monitor,changeSet,checkpoints,previous});
  const signals=[...evaluateSignals({official,monitor,changeSet,checkpoints,previous}),...cornSignals(cornPilot)];
  // Only signal changes are journaled. Continuing identical alerts are not daily
  // 'new signals'; full current evaluations remain in signals for audit/replay.
  const signalKey=s=>stableJSON([s.state==="escalated"?"active":s.state,s.severity,s.calculation,s.eligible]);
  const changedSignals=signals.filter(s=>s.state!=="inactive"&&
    signalKey(s)!==signalKey(old?.signals.find(p=>p.id===s.id)??{}));
  const entry={releaseId,evaluatedAt,changes,signals:changedSignals,unavailable};
  const all=[...(old?.journal??[]).filter(e=>e.releaseId!==releaseId),entry];
  const cutoff=Date.parse(evaluatedAt)-90*DAY;
  const recent=all.filter(e=>Date.parse(e.evaluatedAt)>=cutoff).slice(-128);
  // Byte cap in addition to time/count. Keep this release even if one unusually
  // large official correction exceeds the budget; never truncate its facts.
  let bytes=Buffer.byteLength(JSON.stringify(recent));
  while(recent.length>1&&bytes>2_000_000) {
    const removedEntry=recent.shift();bytes-=Buffer.byteLength(JSON.stringify(removedEntry))+1;
  }
  const removed=all.filter(e=>!recent.includes(e));
  const prunedThrough=removed.at(-1)?.evaluatedAt??old?.prunedThrough??null;
  const result={schemaVersion:1,releaseId,evaluatedAt,startedAt:old?.startedAt??evaluatedAt,prunedThrough,
    checkpoints,health,changeSet,signals,cornPilot,journal:recent,
    weekly:weeklySummary(recent,evaluatedAt,old?.startedAt??evaluatedAt,prunedThrough)};
  result.integrity=digest(result);
  if(!validPhase2(result,releaseId,evaluatedAt))throw new Error("Invalid Phase 2 output");
  return result;
}

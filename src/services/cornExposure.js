import {config,CORN_STAGES,validDate} from "./cornData.js";
export {config};
const DAY=86400000,mean=rows=>rows.reduce((s,v)=>s+v,0)/rows.length;
const finite=Number.isFinite;
export function productionWeights(data) {
  if(!finite(data?.national?.production)||data.national.production<=0||config.regions.some(r=>!finite(data.regions?.[r.id]?.production)||data.regions[r.id].production<=0))return null;
  const weights=Object.fromEntries(config.regions.map(r=>[r.id,data.regions[r.id].production/data.national.production]));
  const covered=Object.values(weights).reduce((s,v)=>s+v,0);
  return covered<=1?{weights,covered,uncovered:1-covered,year:data.year}:null;
}
export function estimatedStage(region,date) {
  if(!validDate(date))return null;
  return config.calendars[region.calendar].filter(([start])=>start<=date.slice(5)).at(-1)?.[1]??null;
}
export function cropStage(region,end,report) {
  const estimated=estimatedStage(region,end),week=report?.weekEnding;
  const official=validDate(week)&&week<=end&&Date.parse(end)-Date.parse(week)<=7*DAY?report.regions?.[region.id]?.progress:null;
  const majority=official?CORN_STAGES.filter(k=>finite(official[k])&&official[k]>=50).at(-1)??null:null;
  let relevant=null,basis="calendar-screen";
  // Cumulative reports do not reveal every field's current stage. Only explicit
  // endpoints or both bounds can qualify the calendar; missing is NEVER zero.
  if(official&&(official.silking===0||official.mature===100||official.harvested===100)) {relevant=false;basis="official-progress-endpoint";}
  else if(official&&finite(official.silking)&&finite(official.mature)) {
    relevant=official.silking>official.mature;basis="official-reproductive-presence";
  }
  return {estimated,officialMajorityMilestone:majority,officialProgress:official??null,weekEnding:official?week:null,
    reproductiveRelevant:relevant,basis};
}
export function weatherWindow(days,baseline,region,end,stage) {
  if(!validDate(end))return null;
  const start=new Date(Date.parse(end)-6*DAY).toISOString().slice(0,10),rows=days?.filter(d=>d.date>=start&&d.date<=end);
  const normal=baseline?.windows?.[end.slice(5)];
  if(rows?.length!==7||rows.some((d,i)=>d.date!==new Date(Date.parse(start)+i*DAY).toISOString().slice(0,10))||!normal||normal.samples!==30)return null;
  const heatDays=rows.filter(d=>d.max>=35).length;
  const relevant=d=>{
    const p=stage.officialProgress,week=stage.weekEnding;
    // Never backcast maturity/harvest completion into earlier weather days or
    // project '0% silked' forward after its observation. Mixed-stage bounds are
    // direct evidence only on the report's observation date.
    if(p&&(p.mature===100||p.harvested===100)&&d.date>=week)return false;
    if(p?.silking===0&&d.date<=week)return false;
    if(d.date===week&&stage.reproductiveRelevant!==null)return stage.reproductiveRelevant;
    return ["silking","grainFill"].includes(estimatedStage(region,d.date));
  };
  const relevantDays=rows.filter(relevant).length;
  const relevantHeatDays=rows.filter(d=>relevant(d)&&d.max>=35).length;
  const maxMean=mean(rows.map(d=>d.max)),rainTotal=rows.reduce((s,d)=>s+d.rain,0),rootMean=mean(rows.map(d=>d.rootWetness));
  return {start,end,days:rows.map(d=>({date:d.date,max:d.max,min:d.min,rain:d.rain,rootWetness:d.rootWetness})),
    maxMean,rainTotal,rootMean,heatDays,relevantDays,relevantHeatDays,
    normal:{...normal,period:config.baseline,method:"matching-calendar-7-day/30-years"},
    maxAnomaly:maxMean-normal.maxMean,rainAnomaly:rainTotal-normal.rainMean,rootAnomaly:rootMean-normal.rootMean,
    heat:relevantHeatDays>=3,moisture:relevantDays===7&&rainTotal<normal.rainP20&&rootMean<normal.rootP20};
}
export function conditionComparison(report,region) {
  const current=report?.regions?.[region]?.condition;
  if(!current)return null;
  const previous=report.history?.find(r=>Date.parse(report.weekEnding)-Date.parse(r.weekEnding)===7*DAY);
  const prior=previous?.regions?.[region]?.condition;
  const ge=current.good+current.excellent,priorGE=prior?prior.good+prior.excellent:null;
  return {weekEnding:report.weekEnding,publishedDate:report.publishedDate,ratings:current,goodExcellent:ge,
    previousWeek:prior?previous.weekEnding:null,previousGoodExcellent:priorGE,
    deltaPoints:priorGE===null?null:ge-priorGE,direction:priorGE===null?"unknown":ge>priorGE?"improved":ge<priorGE?"deteriorated":"unchanged"};
}

export function qualifyCornHealth(snapshot,artifact) {
  const inputs=new Set(artifact.regions.filter(r=>r.eligible).flatMap(r=>r.inputVersions.map(v=>v.datasetId)));
  if(artifact.officialReport)inputs.add("cornProgress");
  return {...snapshot,datasets:snapshot.datasets.map(row=>{
    if(!row.id.startsWith("corn")&&!row.id.startsWith("weather/corn-"))return row;
    const eligible=row.analysisUsable&&inputs.has(row.id);
    return {...row,eligibility:eligible?"eligible":"insufficient",evidence:{...row.evidence,eligible,
      reasons:eligible?[]:[...new Set([...row.reasons,"insufficient_evidence"])]}};
  })};
}

/** Read-only artifact validator. Release binding is checked by the parent feed,
 * including source hashes; invalid/partial evidence never becomes numeric zero. */
export function validCornArtifact(a,releaseId,at) {
  const share=v=>finite(v)&&v>=0&&v<=1+1e-10;
  const version=v=>v&&typeof v.datasetId==="string"&&/^[a-f0-9]{64}$/.test(v.projectionHash)&&/^[a-f0-9]{64}$/.test(v.contentHash);
  const stages=new Set(Object.values(config.calendars).flat().map(r=>r[1]));
  const pct=v=>Number.isInteger(v)&&v>=0&&v<=100;
  const condition=c=>c===null||c&&validDate(c.weekEnding)&&validDate(c.publishedDate)&&pct(c.goodExcellent)&&
    ["improved","deteriorated","unchanged","unknown"].includes(c.direction)&&
    (c.deltaPoints===null||finite(c.deltaPoints)&&pct(c.previousGoodExcellent)&&c.deltaPoints===c.goodExcellent-c.previousGoodExcellent);
  const weather=w=>w===null||w&&w.start===a.period.start&&w.end===a.period.end&&
    [w.maxMean,w.rainTotal,w.rootMean,w.maxAnomaly,w.rainAnomaly,w.rootAnomaly].every(finite)&&
    [w.heatDays,w.relevantDays,w.relevantHeatDays].every(n=>Number.isInteger(n)&&n>=0&&n<=7)&&
    typeof w.heat==="boolean"&&typeof w.moisture==="boolean"&&w.normal?.samples===30&&w.normal.period===config.baseline&&
    Array.isArray(w.days)&&w.days.length===7&&w.days.every((d,i)=>d?.date===new Date(Date.parse(a.period.start)+i*DAY).toISOString().slice(0,10)&&
      [d.max,d.min,d.rain,d.rootWetness].every(finite)&&d.min<=d.max&&d.max<=70&&d.min>=-100&&d.rain>=0&&d.rootWetness>=0&&d.rootWetness<=1);
  return a?.schemaVersion===1&&a.methodVersion===config.methodVersion&&a.releaseId===releaseId&&a.evaluatedAt===at&&
    a.crop==="maize"&&a.country==="US"&&validDate(a.period?.end)&&validDate(a.period.start)&&
    Date.parse(a.period.end)-Date.parse(a.period.start)===6*DAY&&["eligible","partial","unavailable"].includes(a.eligibility)&&
    Array.isArray(a.regions)&&a.regions.length===config.regions.length&&a.regions.every((r,i)=>r?.id===config.regions[i].id&&
      r.name?.zh===config.regions[i].name.zh&&r.name.en===config.regions[i].name.en&&r.point?.lat===config.regions[i].lat&&r.point.lon===config.regions[i].lon&&
      stages.has(r.stage?.estimated)&&[true,false,null].includes(r.stage.reproductiveRelevant)&&
      (r.stage.officialProgress===null||r.stage.officialProgress&&Object.entries(r.stage.officialProgress).every(([k,v])=>CORN_STAGES.includes(k)&&pct(v)))&&
      condition(r.officialCondition)&&weather(r.weather)&&
      (r.productionWeight===null||share(r.productionWeight))&&typeof r.eligible==="boolean"&&Array.isArray(r.reasons)&&
      Array.isArray(r.inputVersions)&&r.inputVersions.every(version)&&
      (!r.eligible||r.productionWeight!==null&&r.weather&&[r.weather.maxAnomaly,r.weather.rainAnomaly,r.weather.rootAnomaly].every(finite)&&
       typeof r.weather.heat==="boolean"&&typeof r.weather.moisture==="boolean"&&r.weather.days?.length===7))&&
    (a.coverage===null||[a.coverage.pilot,a.coverage.outsidePilot,a.coverage.assessed,a.coverage.missing].every(share)&&
      Math.abs(a.coverage.pilot+a.coverage.outsidePilot-1)<1e-9&&Math.abs(a.coverage.assessed+a.coverage.missing-a.coverage.pilot)<1e-9)&&
    [a.exposure?.heat,a.exposure?.moisture].every(v=>v===null||share(v)&&v<=a.coverage?.assessed+1e-9)&&
    (a.officialReport===null||a.officialReport&&validDate(a.officialReport.weekEnding)&&validDate(a.officialReport.publishedDate)&&
      /^https:\/\/esmis\.nal\.usda\.gov\/sites\/default\/release-files\/[^?#]+\.txt$/.test(a.officialReport.url??""))&&
    Array.isArray(a.supply?.revisions)&&typeof a.supply.eligible==="boolean"&&
    (!a.supply.eligible||a.supply.current&&finite(a.supply.current.production)&&finite(a.supply.current.endingStocks))&&
    a.supply.revisions.every(c=>c&&typeof c.id==="string"&&["production","endingStocks"].includes(c.field)&&
      [c.previous,c.current].every(finite)&&c.observation?.commodity==="maize"&&c.previousVersion&&c.currentVersion)&&
    (a.supply.annualRevisions===undefined||Array.isArray(a.supply.annualRevisions)&&a.supply.annualRevisions.every(c=>c?.datasetId==="cornProduction"&&c.type==="revision"&&c.eligible&&
      c.field==="value"&&["maize-production","maize-yield","maize-harvestedArea"].includes(c.observation?.commodity)&&
      c.observation.geography==="US"&&[c.previous,c.current].every(finite)&&c.previousVersion&&c.currentVersion))&&
    Array.isArray(a.inputVersions)&&a.inputVersions.every(version);
}

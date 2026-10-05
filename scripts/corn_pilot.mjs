import {config,productionWeights,cropStage,weatherWindow,conditionComparison,validCornArtifact} from "../src/services/cornExposure.js";
const DAY=86400000;
const inputVersion=record=>{
  const m=record?.metadata;
  if(!m?.version.contentHash)return null;
  // Use the canonical accepted content identity, not a fetch clock.
  return {datasetId:m.datasetId,period:m.observation.period,vintage:m.observation.vintage,
    contentHash:m.version.contentHash,projectionHash:m.version.contentHash,revisionId:m.version.revisionId,
    sourceUrl:m.sourceUrl,downloadUrl:m.downloadUrl,fetchedAt:m.accepted.fetchedAt,
    rawHash:record.data?.rawHash??record.rawHash??null};
};
export const CORN_SIGNALS=[
  {id:"corn/heat-exposure",name:{zh:"玉米产区代表点高温潜在暴露",en:"Corn-region point heat exposure"},type:"weather_exposure",kind:"heuristic"},
  {id:"corn/moisture-exposure",name:{zh:"玉米产区代表点水分不足筛查",en:"Corn-region point moisture-deficit screen"},type:"weather_exposure",kind:"heuristic"},
  {id:"corn/condition-change",name:{zh:"官方玉米优良率变化",en:"Official corn good/excellent change"},type:"official_crop_condition",kind:"factual"},
  {id:"corn/supply-revision",name:{zh:"美国玉米供需估计修订",en:"US corn supply estimate revision"},type:"supply_revision",kind:"factual"},
].map(r=>({...r,version:"1",notification:false}));

export function buildCornPilot({official,monitor,changeSet,checkpoints,previous=null}) {
  const pilot=official?.cornPilot,at=monitor.generatedAt,now=Date.parse(at),releaseId=monitor.release.id;
  const health=id=>monitor.dataHealth.datasets.find(d=>d.id===id);
  const healthy=id=>health(id)?.analysisUsable===true&&changeSet.datasets?.find(d=>d.datasetId===id)?.status!=="retained";
  const p=pilot?.sources?.cornProduction,g=pilot?.sources?.cornProgress;
  const weights=healthy("cornProduction")?productionWeights(p?.data):null;
  const report=healthy("cornProgress")&&now-Date.parse(g?.data?.weekEnding)<=10*DAY?g.data:null;
  // All states use one fixed release-relative window, not their individually
  // newest day (which would silently mix periods on partial fetch failure).
  const end=new Date(Date.parse(at.slice(0,10))-4*DAY).toISOString().slice(0,10);
  const start=new Date(Date.parse(end)-6*DAY).toISOString().slice(0,10);
  const regions=config.regions.map(region=>{
    const id=region.id,w=pilot?.weather?.[id],b=pilot?.baselines?.[id],stage=cropStage(region,end,report);
    const inputs=[p,w,b,...(report?[g]:[])].map(inputVersion).filter(Boolean);
    const ids=["cornProduction",`weather/corn-${id}`,`cornBaseline/${id}`];
    const reasons=ids.flatMap(key=>healthy(key)?[]:health(key)?.reasons??["insufficient_evidence"]);
    const wx=ids.every(healthy)?weatherWindow(w.days,b.data,region,end,stage):null;
    if(!wx)reasons.push("insufficient_evidence");
    return {id,name:region.name,point:{lat:region.lat,lon:region.lon},productionWeight:weights?.weights[id]??null,
      production:weights?p.data.regions[id]:null,stage,weather:wx,officialCondition:conditionComparison(report,id),
      eligible:!!wx&&!!weights,reasons:[...new Set(reasons)],inputVersions:inputs};
  });
  const assessed=regions.filter(r=>r.eligible).reduce((s,r)=>s+r.productionWeight,0);
  const sum=field=>assessed>0?regions.filter(r=>r.eligible&&r.weather[field]).reduce((s,r)=>s+r.productionWeight,0):null;
  const grain=official?.sources?.usda?.data?.grains?.maize;
  const coverage=grain?.coverage?.[grain.latestPeriod];
  const us=coverage?.contributors?.find(c=>c.name==="United States");
  const supplyEligible=healthy("usda")&&!!us&&!!checkpoints.usda?.coverageVerified&&!!checkpoints.usda?.version.contentHash;
  const supplyRevisions=supplyEligible&&previous?.analysis?.checkpoints?.usda?.coverageVerified===true?changeSet.changes.filter(c=>c.datasetId==="usda"&&c.type==="revision"&&c.eligible&&
    c.observation?.commodity==="maize"&&c.observation.geography===us.id&&c.observation.period===grain.latestPeriod&&
    ["production","endingStocks"].includes(c.field)):[];
  const annualRevisions=healthy("cornProduction")?changeSet.changes.filter(c=>c.datasetId==="cornProduction"&&c.type==="revision"&&c.eligible&&
    c.observation?.geography==="US"&&c.observation.period===p.data.year&&c.field==="value"&&
    ["maize-production","maize-yield","maize-harvestedArea"].includes(c.observation.commodity)):[];
  const artifact={schemaVersion:1,methodVersion:config.methodVersion,releaseId,evaluatedAt:at,crop:"maize",country:"US",
    period:{start,end},weightYear:weights?.year??null,weightPublication:p?.data?.publishedDate??null,
    eligibility:!assessed?"unavailable":regions.every(r=>r.eligible)?"eligible":"partial",
    coverage:weights?{pilot:weights.covered,outsidePilot:weights.uncovered,assessed,missing:Math.max(0,weights.covered-assessed)}:null,
    exposure:{heat:sum("heat"),moisture:sum("moisture"),meaning:"national-production-share-associated-with-screened-points-not-affected-area"},
    regions,officialReport:report?{weekEnding:report.weekEnding,publishedDate:report.publishedDate,url:g.source.downloadUrl}:null,
    supply:{eligible:supplyEligible,period:supplyEligible?grain.latestPeriod:null,vintage:supplyEligible?grain.releasePeriod:null,
      current:supplyEligible?{production:us.production,endingStocks:us.endingStocks,unit:official.sources.usda.source.unit}:null,
      revisions:supplyRevisions,annualRevisions,annualReference:healthy("cornProduction")?{year:p.data.year,...p.data.national,
        productionUnit:p.data.unit,areaUnit:p.data.areaUnit,yieldUnit:p.data.yieldUnit}:null},
    inputVersions:[...new Map(regions.flatMap(r=>r.inputVersions).map(v=>[v.datasetId,v])).values(),
      ...(supplyEligible?[checkpoints.usda.version]:[])],
    limitations:["one-grid-point-per-state","calendar-is-estimated","not-crop-area-weighted-weather","no-causal-or-yield-loss-inference"]};
  if(!validCornArtifact(artifact,releaseId,at))throw new Error("Invalid corn exposure artifact");
  return artifact;
}

export function cornSignals(artifact) {
  const signals=[];
  const make=(rule,id,inputs,calculation,extra={})=>({ruleId:rule.id,ruleVersion:"1",id:`${rule.id}/${id}`,name:rule.name,
    method:config.methodVersion,threshold:{kind:rule.kind,validated:false},evidenceType:rule.type,notification:false,severity:null,
    releaseId:artifact.releaseId,evaluatedAt:artifact.evaluatedAt,state:"observed",eligible:true,reasons:[],inputs,calculation,...extra});
  for(const [i,field] of ["heat","moisture"].entries())if(artifact.exposure[field]>0) {
    const inputs=artifact.inputVersions;
    signals.push(make(CORN_SIGNALS[i],artifact.period.end,inputs,{share:artifact.exposure[field],assessedShare:artifact.coverage.assessed,
      start:artifact.period.start,end:artifact.period.end}));
  }
  for(const row of artifact.regions) {
    const c=row.officialCondition;
    if(c&&c.deltaPoints!==null&&c.deltaPoints!==0)signals.push(make(CORN_SIGNALS[2],row.id,row.inputVersions.filter(v=>v.datasetId==="cornProgress"),
      {previous:c.previousGoodExcellent,current:c.goodExcellent,absoluteDelta:c.deltaPoints,percentDelta:null,unit:"percentage points",
        previousPeriod:c.previousWeek,currentPeriod:c.weekEnding}));
  }
  for(const c of [...artifact.supply.revisions,...(artifact.supply.annualRevisions??[])])signals.push(make(CORN_SIGNALS[3],c.id,[c.previousVersion,c.currentVersion],
    {previous:c.previous,current:c.current,absoluteDelta:c.absoluteDelta,percentDelta:c.percentDelta,unit:c.unit},
    {changeId:c.id,observation:c.observation}));
  return signals;
}

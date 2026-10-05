/** Research replay only. No notification imports, live writes, or threshold tuning. */
import {config,productionWeights,cropStage,weatherWindow} from "../src/services/cornExposure.js";
import {validProgress,validCornData,validCornBaseline,validDate} from "../src/services/cornData.js";
import {validMetadata} from "../src/services/dataContract.js";
import {digest} from "./revision_tracking.mjs";
export const PROTOCOL="corn-history/1",LAGS=[1,2,4];
const DAY=86400000,add=(date,n)=>new Date(Date.parse(date)+n*DAY).toISOString().slice(0,10);
const finite=Number.isFinite,mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const version=r=>({datasetId:r.metadata.datasetId,...r.metadata.version,period:r.metadata.observation.period,
  vintage:r.metadata.observation.vintage,publishedDate:r.data?.publishedDate??null,
  sourceUrl:r.metadata.sourceUrl,downloadUrl:r.metadata.downloadUrl,fetchedAt:r.metadata.accepted.fetchedAt,
  historyKind:r.metadata.extensions.historyKind??"retrospective-baseline"});
const accepted=r=>r?.status==="ok"&&validMetadata(r.metadata)&&r.metadata.version.contentHash&&
  r.metadata.accepted.semantic==="passed"&&r.metadata.accepted.period==="verified";
function validSupply(r) {
  const d=r?.data;
  return accepted(r)&&r.metadata.extensions.archiveKind==="supply"&&validDate(d?.publishedDate)&&
    d.year===d.publishedDate.slice(0,4)&&r.metadata.extensions.publicationDate===d.publishedDate&&
    r.metadata.observation.period===d.year&&r.metadata.observation.vintage===d.publishedDate.slice(0,7)&&
    d.unit==="1000 bushels"&&d.areaUnit==="1000 acres"&&d.yieldUnit==="bushels/acre"&&
    [d.national?.production,d.national?.yield,d.national?.harvestedArea].every(n=>finite(n)&&n>0)&&
    Math.abs(d.national.yield*d.national.harvestedArea-d.national.production)/d.national.production<=.015&&
    /^https:\/\/esmis\.nal\.usda\.gov\/sites\/default\/release-files\/.+\.txt$/.test(r.source?.downloadUrl??"");
}
export function asOfOfficial(records,asOf,{year,weekEnding}={}) {
  if(!validDate(asOf))return null;
  const rows=records.filter(r=>accepted(r)&&validDate(r.data?.publishedDate)&&r.data.publishedDate<asOf&&
    r.metadata.extensions.publicationDate===r.data.publishedDate&&r.metadata.extensions.historyKind==="published-report-vintage"&&
    r.metadata.observation.vintage===r.data.publishedDate.slice(0,7)&&
    r.metadata.observation.period===(r.data.weekEnding??r.data.year)&&
    (!year||r.data.year===String(year))&&(!weekEnding||r.data.weekEnding<=weekEnding))
    .sort((a,b)=>a.data.publishedDate.localeCompare(b.data.publishedDate));
  const latest=rows.at(-1);
  // A date alone cannot order conflicting same-day corrections.
  if(latest&&rows.some(r=>r.data.publishedDate===latest.data.publishedDate&&r.metadata.version.contentHash!==latest.metadata.version.contentHash))return null;
  return latest??null;
}
export function weeks(year) {
  const result=[];
  for(let day=`${year}-04-01`;day<=`${year}-11-30`;day=add(day,1))if(new Date(day).getUTCDay()===0)result.push(day);
  return result;
}
function validWeather(record,region) {
  if(!accepted(record)||!Array.isArray(record.days)||!record.days.length||record.metadata.datasetId!==`weather/corn-${region.id}`)return false;
  let u;try{u=new URL(record.url);}catch{return false;}
  if(u.origin!=="https://power.larc.nasa.gov"||+u.searchParams.get("latitude")!==region.lat||+u.searchParams.get("longitude")!==region.lon||u.searchParams.get("time-standard")!=="UTC")return false;
  return record.days.every((d,i)=>validDate(d.date)&&(!i||d.date>record.days[i-1].date)&&
    [d.max,d.min,d.rain,d.rootWetness].every(finite)&&d.min<=d.max&&d.max<=70&&d.min>=-100&&d.rain>=0&&d.rain<=2000&&d.rootWetness>=0&&d.rootWetness<=1);
}
const usableBaseline=(r,region)=>accepted(r)&&validCornBaseline(r,region);

export function heatDiagnostics(days,baseline,region,end,stage,wx) {
  const rows=days.filter(d=>d.date>=add(end,-6)&&d.date<=end);
  // Sensitivity experiments use the EXACT live stage gate, not a competing
  // calendar implementation. Translated temperatures are never stored as data.
  const threshold=t=>weatherWindow(rows.map(d=>({...d,max:d.max+35-t,min:d.min+35-t})),baseline,region,end,stage)?.heat??null;
  const mask=rows.map((_,i)=>weatherWindow(rows.map((d,j)=>({...d,max:j===i?35:34,min:Math.min(d.min,34)})),baseline,region,end,stage).relevantHeatDays===1);
  let run=0,longest=0;
  rows.forEach((d,i)=>{run=mask[i]&&d.max>=35?run+1:0;longest=Math.max(longest,run);});
  return {heat33:threshold(33),heat35:wx.heat,heat37:threshold(37),heat35Consecutive:longest>=3,
    anomaly3:wx.relevantDays===7&&wx.maxAnomaly>=3};
}

/** A full PIT signal is intentionally unavailable: none of the collected POWER
 * responses are delivery-time snapshots, and the fixed normal ends in 2020. */
export function replaySeason(input,year,{mode="retrospective"}={}) {
  if(!["retrospective","point-in-time"].includes(mode)||!Number.isInteger(year))throw new Error("Invalid replay request");
  if(mode==="point-in-time")return {season:year,validationMode:mode,eligibility:"unavailable",timeline:[],
    reasons:["historical-weather-delivery-vintages-unavailable","baseline-not-proven-available-as-of-evaluation"]};
  const annual=(input.annual??[]).filter(r=>accepted(r)&&validCornData("cornProduction",r,Date.parse(r.fetchedAt)));
  const reports=(input.progress??[]).filter(r=>accepted(r)&&validProgress(r.data,Date.parse(r.fetchedAt)));
  const weightRecord=asOfOfficial(annual,`${year}-04-01`,{year:year-1});
  const weights=weightRecord?productionWeights(weightRecord.data):null;
  const baselineOK=Object.fromEntries(config.regions.map(r=>[r.id,usableBaseline(input.baselines?.[r.id],r)]));
  const weatherOK=Object.fromEntries(config.regions.map(r=>[r.id,validWeather(input.weather?.[r.id],r)]));
  const inputVersions=new Map();
  const remember=r=>{if(!r)return null;const v=version(r),id=`${v.datasetId}/${v.contentHash}`;inputVersions.set(id,v);return id;};
  const timeline=weeks(year).map(end=>{
    const asOf=add(end,4),official=asOfOfficial(reports,asOf,{weekEnding:end});
    const report=official&&official.data.weekEnding<=end&&Date.parse(end)-Date.parse(official.data.weekEnding)<=7*DAY?official:null;
    const regions=config.regions.map(region=>{
      const stage=cropStage(region,end,report?.data),wr=input.weather?.[region.id],br=input.baselines?.[region.id];
      const wx=weights&&weatherOK[region.id]&&baselineOK[region.id]?weatherWindow(wr.days,br.data,region,end,stage):null;
      const diagnostics=wx?heatDiagnostics(wr.days,br.data,region,end,stage,wx):null;
      const compact=wx?Object.fromEntries(Object.entries(wx).filter(([key])=>!["days","normal"].includes(key))):null;
      return {id:region.id,stage,weight:weights?.weights[region.id]??null,weather:compact,diagnostics,
        eligible:!!wx,condition:report?.data.regions[region.id].condition??null,
        conditionWeek:report?.data.weekEnding??null,
        inputs:[weightRecord,wr,br,report].filter(Boolean).map(remember)};
    });
    const assessed=regions.filter(r=>r.eligible).reduce((s,r)=>s+r.weight,0);
    const sum=f=>assessed>0?regions.filter(r=>r.eligible&&f(r)).reduce((s,r)=>s+r.weight,0):null;
    return {end,asOf,coverage:weights?{pilot:weights.covered,assessed,missing:weights.covered-assessed,outsidePilot:weights.uncovered}:null,
      eligible:!!weights&&regions.every(r=>r.eligible),heat:sum(r=>r.weather.heat),moisture:sum(r=>r.weather.moisture),
      union:sum(r=>r.weather.heat||r.weather.moisture),
      diagnostics:Object.fromEntries(["heat33","heat35","heat37","heat35Consecutive","anomaly3"].map(k=>[k,sum(r=>r.diagnostics[k])])),regions};
  });
  // Outcomes are joined only AFTER the exposure replay, never passed to stages,
  // weights or weather. Actual publication evidence stays attached separately.
  const conditionTimeline=reports.filter(r=>r.data.weekEnding.startsWith(String(year))).map(r=>({
    weekEnding:r.data.weekEnding,publishedDate:r.data.publishedDate,regions:r.data.regions,input:remember(r)}));
  const supplyRecords=[...(input.supply??[]).filter(validSupply),...annual].filter(r=>r.data.year===String(year));
  const supplyTimeline=supplyRecords.filter((r,i)=>
    !supplyRecords.some(other=>other.data.publishedDate===r.data.publishedDate&&other.metadata.version.contentHash!==r.metadata.version.contentHash)&&
    supplyRecords.findIndex(other=>other.metadata.version.contentHash===r.metadata.version.contentHash)===i)
    .sort((a,b)=>a.data.publishedDate.localeCompare(b.data.publishedDate))
    .map(r=>({publishedDate:r.data.publishedDate,...r.data.national,input:remember(r),kind:r.metadata.extensions.archiveKind}));
  const initial=supplyTimeline.find(r=>r.kind==="supply"&&r.publishedDate.startsWith(`${year}-08`));
  const postHarvest=supplyTimeline.find(r=>r.kind==="annual"&&r.publishedDate>`${year}-12-31`);
  const outcome={label:"published-post-harvest-estimate-not-latest-final",initial:initial??null,postHarvest:postHarvest??null,
    revision:initial&&postHarvest?Object.fromEntries(["yield","production","harvestedArea"].map(k=>[k,{absolute:postHarvest[k]-initial[k],percent:(postHarvest[k]-initial[k])/initial[k]*100}])):null,
    priorYearChange:postHarvest&&weightRecord?{yield:postHarvest.yield-weightRecord.data.national.yield,productionPercent:(postHarvest.production-weightRecord.data.national.production)/weightRecord.data.national.production*100}:null,
    latestFinal:null};
  const comparisons=compareConditions(timeline,conditionTimeline);
  const thresholdOutcomes=Object.fromEntries(["heat33","heat35","heat37","heat35Consecutive","anomaly3"].map(k=>
    [k,Object.fromEntries(Object.entries(compareConditions(timeline,conditionTimeline,r=>r.diagnostics[k])).map(([lag,{cases,...summary}])=>[lag,summary]))]));
  const complete=timeline.filter(w=>w.eligible);
  const stats={scheduledWeeks:timeline.length,completeWeeks:complete.length,
    exposedWeeks:complete.filter(w=>w.union>0).length,maxExposure:complete.length?Math.max(...complete.map(w=>w.union)):null,
    heatShareWeeks:complete.length?complete.reduce((s,w)=>s+w.heat,0):null,
    moistureShareWeeks:complete.length?complete.reduce((s,w)=>s+w.moisture,0):null,
    unionShareWeeks:complete.length?complete.reduce((s,w)=>s+w.union,0):null,
    stateContributions:Object.fromEntries(config.regions.map(r=>[r.id,complete.reduce((s,w)=>{
      const row=w.regions.find(x=>x.id===r.id);return s+(row.weather.heat||row.weather.moisture?row.weight:0);
    },0)])),stageWeeks:Object.fromEntries(["planting","emergence","vegetative","silking","grainFill","maturity","harvest","off"].map(k=>[k,timeline.reduce((s,w)=>s+w.regions.filter(r=>r.stage.estimated===k).length,0)]))};
  return {season:year,crop:"maize",methodologyVersion:config.methodVersion,validationMode:mode,
    eligibility:complete.length===timeline.length?"eligible":complete.length?"partial":"unavailable",weightYear:weights?.year??null,
    timeline,conditionTimeline,supplyTimeline,outcome,comparisons,thresholdOutcomes,stats,inputVersions:Object.fromEntries(inputVersions),
    spatial:spatialDiagnostic(input,year,timeline,weights)};
}

const good=r=>r?.condition? r.condition.good+r.condition.excellent:null;
export function compareConditions(timeline,reports,screen=r=>r.weather.heat||r.weather.moisture) {
  const out={};
  for(const lag of LAGS) {
    const pairs=[];
    for(const [i,week] of timeline.entries())for(const r of week.regions) {
      if(!r.eligible)continue;
      // Multiple conflicting archived editions do not acquire an invented order.
      const select=date=>{const rows=reports.filter(p=>p.weekEnding===date);return rows.length===1?rows[0]:null;};
      const before=select(week.end),after=select(add(week.end,lag*7));
      const ge0=good(before?.regions[r.id]),ge1=good(after?.regions[r.id]);
      if(!finite(ge0)||!finite(ge1))continue;
      const previous=timeline[i-1]?.regions.find(x=>x.id===r.id);
      const exposed=screen(r),delta=ge1-ge0;
      pairs.push({state:r.id,end:week.end,lag,exposed,deltaPoints:delta,deteriorated:delta<=-5,
        category:exposed?(delta<=-5?"exposure-and-decline":"false-positive-like"):(delta<=-5?"false-negative-like":"quiet-without-decline"),
        afterStress:!exposed&&previous?.eligible===true&&screen(previous)&&timeline[i-1].end===add(week.end,-7),
        baselineInput:before.input,outcomeInput:after.input});
    }
    const exposed=pairs.filter(p=>p.exposed),quiet=pairs.filter(p=>!p.exposed),declines=pairs.filter(p=>p.deteriorated),ended=pairs.filter(p=>p.afterStress);
    const fp=exposed.filter(p=>!p.deteriorated).length,fn=quiet.filter(p=>p.deteriorated).length;
    out[lag]={pairs:pairs.length,exposedPairs:exposed.length,quietPairs:quiet.length,declinePairs:declines.length,
      meanChangeAfterExposure:mean(exposed.map(p=>p.deltaPoints)),meanChangeWithoutExposure:mean(quiet.map(p=>p.deltaPoints)),
      falsePositiveLike:fp,falseNegativeLike:fn,falsePositiveLikeFraction:exposed.length?fp/exposed.length:null,
      hitFraction:declines.length?(declines.length-fn)/declines.length:null,
      postStressPairs:ended.length,meanPostStressChange:mean(ended.map(p=>p.deltaPoints)),
      postStressImproved:ended.filter(p=>p.deltaPoints>0).length,cases:pairs};
  }
  return out;
}
export function spatialDiagnostic(input,year,timeline,weights) {
  const base=config.regions.find(r=>r.id==="IA");
  return ["west","east"].map(side=>{
    const region={...base,id:`IA-${side}`,lon:base.lon+(side==="west"?-1:1)},record=input.spatial?.[region.id];
    if(!weights||!validWeather(record,region)||!usableBaseline(input.baselines?.IA,base))return {point:region.id,eligible:false};
    const rows=timeline.flatMap(w=>{
      const center=w.regions.find(r=>r.id==="IA");
      if(!center.eligible)return [];
      // Baseline is not used by the absolute-temperature heat rule. Deliberately
      // do NOT interpret alternative-point moisture/anomalies against Iowa-center normals.
      const wx=weatherWindow(record.days,input.baselines.IA.data,region,w.end,center.stage);
      return wx?[{end:w.end,center:center.weather.heat,alternative:wx.heat}]:[];
    });
    const discordant=rows.filter(r=>r.center!==r.alternative);
    return {point:region.id,eligible:!!rows.length,pointCoordinates:{lat:region.lat,lon:region.lon},
      pairedWeeks:rows.length,discordantWeeks:discordant.length,centerOnly:rows.filter(r=>r.center&&!r.alternative).length,
      alternativeOnly:rows.filter(r=>!r.center&&r.alternative).length,
      maxNationalShareDifference:discordant.length?weights.weights.IA:0,
      weatherVersion:version(record),cases:discordant};
  });
}
export function correlation(pairs) {
  pairs=pairs.filter(p=>p.every(finite));
  const pearson=p=>{
    if(p.length<3)return null;
    const x=mean(p.map(v=>v[0])),y=mean(p.map(v=>v[1]));
    const numerator=p.reduce((s,[a,b])=>s+(a-x)*(b-y),0),denom=Math.sqrt(p.reduce((s,[a])=>s+(a-x)**2,0)*p.reduce((s,[,b])=>s+(b-y)**2,0));
    return denom?numerator/denom:null;
  };
  const rank=a=>a.map(v=>{const lower=a.filter(x=>x<v).length,equal=a.filter(x=>x===v).length;return lower+(equal+1)/2;});
  const xs=rank(pairs.map(p=>p[0])),ys=rank(pairs.map(p=>p[1]));
  return {n:pairs.length,pearson:pearson(pairs),spearman:pearson(xs.map((x,i)=>[x,ys[i]]))};
}
export function evaluateHistory(input) {
  if(input?.schemaVersion!==1||input.protocol!==PROTOCOL||!Array.isArray(input.seasons)||new Set(input.seasons).size!==input.seasons.length)throw new Error("Invalid historical input");
  const seasons=input.seasons.map(y=>replaySeason(input,y));
  const summary={seasonCount:seasons.length,conditionLags:LAGS,
    associations:Object.fromEntries(["heatShareWeeks","moistureShareWeeks","unionShareWeeks"].map(k=>[k,correlation(seasons.map(s=>[s.stats.completeWeeks===s.stats.scheduledWeeks?s.stats[k]:null,s.outcome.revision?.yield.absolute]))])),
    thresholdComparison:Object.fromEntries(["heat33","heat35","heat37","heat35Consecutive","anomaly3"].map(k=>[k,{
      completeWeeks:seasons.reduce((s,y)=>s+y.timeline.filter(w=>w.eligible).length,0),
      exposedWeeks:seasons.reduce((s,y)=>s+y.timeline.filter(w=>w.eligible&&w.diagnostics[k]>0).length,0),
      shareWeeks:seasons.reduce((s,y)=>s+y.timeline.filter(w=>w.eligible).reduce((t,w)=>t+w.diagnostics[k],0),0)}]))};
  return {schemaVersion:1,protocol:PROTOCOL,methodologyVersion:config.methodVersion,validationMode:"retrospective",
    inputHash:digest(input),artifactId:`research-${digest([PROTOCOL,config,input])}`,
    pointInTime:{eligibility:"unavailable",reasons:replaySeason(input,input.seasons[0],{mode:"point-in-time"}).reasons},
    limitations:["revised-weather-not-as-of","1991-2020-baseline-hindsight","eight-seasons-not-independent","one-point-per-state",
      "unvalidated-calendar","no-causal-or-predictive-claim","published-post-harvest-estimate-not-final","multiple-comparisons-no-threshold-selection"],
    sourceGaps:input.errors??[],summary,seasons};
}

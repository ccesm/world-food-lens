/** Phase 4B-1: state/time input alignment, NOT crop-area/weather intersection.
 * Pure shared build/research logic. No calendar fallback, fitting or new hazards.
 */
import alignment from "../data/cornAlignment.json" with {type:"json"};
import {config,CORN_STAGES,validDate,validCornBaseline} from "./cornData.js";
import {weatherWindow} from "./cornExposure.js";
import {validMetadata,normalizeMetadata} from "./dataContract.js";
import {derivedProvenance} from "./dataHealth.js";
export {alignment};
const DAY=86400000,finite=Number.isFinite,hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export const addDay=(d,n)=>new Date(Date.parse(d)+n*DAY).toISOString().slice(0,10);
const share=v=>finite(v)&&v>=0&&v<=1+1e-10;
const accepted=r=>r?.status==="ok"&&validMetadata(r.metadata)&&normalizeMetadata(r)&&hash(r.metadata.version.contentHash)&&
  r.metadata.accepted.semantic==="passed"&&r.metadata.accepted.period==="verified"&&["new","unchanged"].includes(r.metadata.cache);
export function alignmentVersion(record) {
  const m=record?.metadata;
  return m?{datasetId:m.datasetId,period:m.observation.period,vintage:m.observation.vintage,
    ...m.version,projectionHash:m.version.contentHash,sourceUrl:m.sourceUrl,downloadUrl:m.downloadUrl}:null;
}

/** USDA reports cumulative acres reaching a milestone, not exclusive occupancy.
 * Missing milestones are constrained by their observed neighbours, never zero.
 * Ranges express missing milestone information, not statistical confidence.
 */
export function progressDistribution(progress) {
  if(!progress||typeof progress!=="object"||Array.isArray(progress)||!Object.keys(progress).length||
    Object.entries(progress).some(([k,v])=>!CORN_STAGES.includes(k)||!Number.isInteger(v)||v<0||v>100))return null;
  const known=CORN_STAGES.filter(k=>Object.hasOwn(progress,k));
  if(known.some((k,i)=>i>0&&progress[k]>progress[known[i-1]]))return null;
  const bounds=Object.fromEntries(CORN_STAGES.map((k,i)=>[k,Object.hasOwn(progress,k)?
    {lower:progress[k]/100,upper:progress[k]/100,reported:true}:
    {lower:Math.max(0,...CORN_STAGES.slice(i+1).filter(x=>Object.hasOwn(progress,x)).map(x=>progress[x]))/100,
      upper:Math.min(100,...CORN_STAGES.slice(0,i).filter(x=>Object.hasOwn(progress,x)).map(x=>progress[x]))/100,reported:false}]));
  const difference=(a,b)=>({lower:Math.max(0,bounds[a].lower-bounds[b].upper),
    upper:Math.max(0,bounds[a].upper-bounds[b].lower),exact:bounds[a].reported&&bounds[b].reported});
  const relevant=difference("silking","mature");
  return {cumulative:{...progress},relevant,bands:CORN_STAGES.slice(0,-1).map((k,i)=>({
    from:k,to:CORN_STAGES[i+1],...difference(k,CORN_STAGES[i+1])})),
    informative:relevant.lower>0||relevant.upper<1,
    meaning:"approximate-acre-milestone-brackets-not-physiological-stage-occupancy"};
}

/** Units keep the NATIONAL denominator, including when a known region is absent.
 * Live accepted production records still pass the stricter canonical validator.
 */
export function nationalWeights(data) {
  const n=data?.national?.production;
  if(!finite(n)||n<=0||!/^\d{4}$/.test(data?.year??""))return null;
  const weights=Object.fromEntries(alignment.units.map(u=>[u.state,
    finite(data.regions?.[u.state]?.production)&&data.regions[u.state].production>0?data.regions[u.state].production/n:null]));
  const covered=Object.values(weights).filter(finite).reduce((s,v)=>s+v,0);
  return covered<=1?{weights,covered,unrepresented:1-covered,year:data.year}:null;
}

/** Full records in research; published editions embedded in a canonically bound
 * progress bundle in operations. Preserve both parent version and raw edition.
 */
export function progressEditions(records) {
  return records.filter(accepted).flatMap(r=>{
    if(r.metadata.datasetId!=="cornProgress")return [];
    return (r.data?.history??[r.data]).filter(d=>validDate(d?.weekEnding)&&validDate(d.publishedDate)&&
      d.publishedDate>=d.weekEnding&&Date.parse(d.publishedDate)-Date.parse(d.weekEnding)<=3*DAY&&hash(d.rawHash))
      .map(d=>({data:d,version:alignmentVersion(r),record:r}));
  });
}
export function stageAsOf(editions,state,day) {
  if(!validDate(day))return {status:"invalid-date",stage:null,edition:null};
  // Date-only publication evidence cannot prove availability before the day's
  // weather started. Conservative exclusion of same-day publications.
  const eligible=editions.filter(e=>e.data.publishedDate<day&&e.data.weekEnding<=day)
    .sort((a,b)=>a.data.publishedDate.localeCompare(b.data.publishedDate)||a.data.weekEnding.localeCompare(b.data.weekEnding)||
      a.version.contentHash.localeCompare(b.version.contentHash));
  const latest=eligible.at(-1);
  if(!latest)return {status:"no-published-report",stage:null,edition:null};
  const identity=e=>JSON.stringify([e.data.weekEnding,e.data.rawHash,e.data.regions]);
  if(eligible.some(e=>e.data.publishedDate===latest.data.publishedDate&&identity(e)!==identity(latest)))
    return {status:"ambiguous-publication",stage:null,edition:null};
  const edition={weekEnding:latest.data.weekEnding,publishedDate:latest.data.publishedDate,
    rawHash:latest.data.rawHash,parentVersion:latest.version,
    sourceUrl:config.progressSource,
    // The operational rolling bundle does not preserve earlier download URLs.
    // Never label the latest report's URL as an earlier edition's source.
    downloadUrl:latest.data.rawHash===latest.record?.data?.rawHash?latest.version.downloadUrl:null};
  // Weekly publication cadence, not observation + 7: otherwise every Monday
  // becomes an artificial gap while that day's new report is not yet usable.
  if(Date.parse(day)-Date.parse(latest.data.publishedDate)>7*DAY)return {status:"stale-stage-observation",stage:null,edition};
  const stage=progressDistribution(latest.data.regions?.[state]?.progress);
  return {status:!stage?"missing-or-inconsistent-progress":!stage.informative?"uninformative-stage-bounds":"aligned-held-observation",
    stage,edition};
}

function validPoint(record,unit) {
  if(!accepted(record)||record.metadata.datasetId!==`weather/corn-${unit.state}`||!Array.isArray(record.days))return false;
  let u;try{u=new URL(record.url);}catch{return false;}
  if(u.origin!=="https://power.larc.nasa.gov"||u.pathname!=="/api/temporal/daily/point"||
    +u.searchParams.get("latitude")!==unit.lat||+u.searchParams.get("longitude")!==unit.lon||
    u.searchParams.get("time-standard")!=="UTC"||u.searchParams.get("community")!=="AG"||
    !["T2M_MAX","T2M_MIN","PRECTOTCORR","GWETROOT"].every(p=>u.searchParams.get("parameters")?.split(",").includes(p)))return false;
  return record.days.every((d,i)=>validDate(d.date)&&(!i||d.date>record.days[i-1].date)&&
    [d.max,d.min,d.rain,d.rootWetness].every(finite)&&d.min<=d.max&&d.min>=-100&&d.max<=70&&d.rain>=0&&d.rain<=2000&&share(d.rootWetness));
}

function stageScreen(daily,wx) {
  const hot=wx.days.map((w,i)=>({...daily[i],hot:w.max>=35})).filter(d=>d.hot);
  const lowerHot=hot.filter(d=>d.stage.relevant.lower>0).length,upperHot=hot.filter(d=>d.stage.relevant.upper>0).length;
  const heat=lowerHot>=3?true:upperHot<3?false:null;
  const dry=wx.rainTotal<wx.normal.rainP20&&wx.rootMean<wx.normal.rootP20;
  const moisture=!dry||daily.some(d=>d.stage.relevant.upper===0)?false:daily.every(d=>d.stage.relevant.lower>0)?true:null;
  const range=(days,flag)=>({lower:flag===true?days.reduce((s,d)=>s+d.stage.relevant.lower,0)/days.length:0,
    upper:flag===false?0:days.reduce((s,d)=>s+d.stage.relevant.upper,0)/days.length});
  return {screen:{heat,moisture},exposure:{heat:hot.length?range(hot,heat):{lower:0,upper:0},moisture:range(daily,moisture)}};
}

export function alignUnit({unit,end,editions,weather,baseline,weight=null,allowWeather=true,allowStage=true}) {
  const region=config.regions.find(r=>r.id===unit.state),mapping=!!region&&region.lat===unit.lat&&region.lon===unit.lon;
  const dates=Array.from({length:7},(_,i)=>addDay(end,i-6));
  const daily=dates.map(date=>({date,...(allowStage?stageAsOf(editions,unit.state,date):{status:"ineligible-progress-source",stage:null,edition:null})}));
  // Obtain ONLY the original weather quantities/baseline. Legacy calendar gates
  // and legacy screen flags are deliberately ignored below.
  const wx=mapping&&allowWeather&&validPoint(weather,unit)&&accepted(baseline)&&validCornBaseline(baseline,region)?
    weatherWindow(weather.days,baseline.data,region,end,{officialProgress:null,weekEnding:null,reproductiveRelevant:null}):null;
  const stageCovered=daily.every(d=>d.status==="aligned-held-observation");
  const joint=mapping&&weight!==null&&stageCovered&&!!wx;
  const screen={heat:null,moisture:null},exposure={heat:null,moisture:null};
  if(joint) {
    // Temporal means conditional on the unchanged screen; not unique acreage.
    const result=stageScreen(daily,wx);Object.assign(screen,result.screen);Object.assign(exposure,result.exposure);
  }
  return {id:unit.id,state:unit.state,crop:"maize",name:region?.name??{en:unit.state,zh:unit.state},
    geography:{country:"US",state:unit.state,resolution:"state"},point:{lat:unit.lat,lon:unit.lon},
    samplingVersion:alignment.samplingVersion,productionWeight:weight,mapping,stageCovered,weatherCovered:!!wx,joint,
    sampleCount:wx?1:0,temporalStatus:stageCovered?"held-published-weekly-observations":"incomplete",daily,
    weather:wx?{days:wx.days,rainTotal:wx.rainTotal,rootMean:wx.rootMean,normal:wx.normal,heatDays:wx.heatDays}:null,
    screen,exposure,reasons:[...(!mapping?["unverified-spatial-mapping"]:[]),...(weight===null?["missing-production-weight"]:[]),
      ...(!wx?["missing-eligible-point-weather-or-baseline"]:[]),...new Set(daily.filter(d=>d.status!=="aligned-held-observation").map(d=>d.status))],
    inputVersions:[weather,baseline].filter(accepted).map(alignmentVersion)};
}

export function buildAlignment({production,progress=[],weather={},baselines={},end,evaluatedAt,releaseId,usable=()=>true}) {
  if(!validDate(end)||!Number.isFinite(Date.parse(evaluatedAt))||end>evaluatedAt.slice(0,10))throw new Error("Invalid alignment observation period");
  const weights=accepted(production)&&production.metadata.datasetId==="cornProduction"&&usable("cornProduction")&&validDate(production.data?.publishedDate)&&
    production.data.year===String(Number(end.slice(0,4))-1)&&production.data.publishedDate<addDay(end,-6)?
    nationalWeights(production.data):null;
  const editions=progressEditions(progress),regions=alignment.units.map(unit=>alignUnit({unit,end,editions,
    weather:weather[unit.state],baseline:baselines[unit.state],weight:weights?.weights[unit.state]??null,
    allowWeather:usable(`weather/corn-${unit.state}`)&&usable(`cornBaseline/${unit.state}`),allowStage:usable("cornProgress")}));
  const sum=filter=>regions.filter(r=>r.productionWeight!==null&&filter(r)).reduce((s,r)=>s+r.productionWeight,0);
  const coverage=weights?{production:weights.covered,mapping:sum(r=>r.mapping),stage:sum(r=>r.mapping&&r.stageCovered),
    weather:sum(r=>r.mapping&&r.weatherCovered),joint:sum(r=>r.joint),unrepresented:1-weights.covered,
    missingJoint:1-sum(r=>r.joint),withinPilotMissingJoint:weights.covered-sum(r=>r.joint)}:null;
  const exposure=Object.fromEntries(["heat","moisture"].map(f=>[f,coverage?.joint>0?{
    lower:regions.filter(r=>r.joint).reduce((s,r)=>s+r.productionWeight*r.exposure[f].lower,0),
    upper:regions.filter(r=>r.joint).reduce((s,r)=>s+r.productionWeight*r.exposure[f].upper,0),
    screenedStateShare:sum(r=>r.joint&&r.screen[f]===true),possibleStateShare:sum(r=>r.joint&&r.screen[f]!==false)}:null]));
  const usedEditions=[...new Map(regions.flatMap(r=>r.daily.filter(d=>d.edition).map(d=>d.edition))
    .map(e=>[JSON.stringify([e.parentVersion.contentHash,e.rawHash,e.publishedDate,e.weekEnding]),e])).values()];
  const selectedHashes=new Set(usedEditions.map(e=>e.parentVersion.contentHash));
  const records=[production,...progress.filter(r=>selectedHashes.has(r?.metadata?.version.contentHash)),
    ...Object.values(weather),...Object.values(baselines)].filter(accepted);
  for(const r of regions)r.inputVersions=[alignmentVersion(production),
    ...usedEditions.filter(e=>r.daily.some(d=>d.edition?.rawHash===e.rawHash)).map(e=>e.parentVersion),...r.inputVersions].filter(Boolean);
  const artifact={schemaVersion:1,methodVersion:alignment.methodVersion,legacyMethodVersion:config.methodVersion,releaseId,evaluatedAt,
    crop:"maize",country:"US",period:{start:addDay(end,-6),end},spatialLevel:alignment.spatialLevel,
    samplingVersion:alignment.samplingVersion,stageMethod:alignment.stageMethod,temporalMethod:alignment.temporalMethod,
    weightMethod:alignment.weightMethod,weightYear:weights?.year??null,productionVersion:alignmentVersion(production),
    eligibility:!coverage?.joint?"unavailable":regions.every(r=>r.joint)?"eligible":"partial",coverage,
    sampleCount:regions.reduce((s,r)=>s+r.sampleCount,0),regions,exposure,progressEditions:usedEditions,
    provenance:derivedProvenance(alignment.methodVersion,records,{now:Date.parse(evaluatedAt),release:releaseId,eligible:!!coverage?.joint}),
    inputVersions:records.map(alignmentVersion),
    interpretation:"stage-weather-screening-exposure-not-affected-acreage",
    limitations:["state-only-geographic-match-not-observed-crop-weather-overlap","one-point-not-state-wide-weather",
      "acre-progress-applied-to-production-share-assumes-uniform-yield","weekly-hold-not-daily-observation",
      "progress-acreage-universe-not-verified-grain-only",
      "silking-to-mature-bracket-not-exact-pollination","range-not-confidence-or-damage-bound","missing-not-normalized"]};
  return artifact;
}

function validateAlignment(a,id,at) {
  if(!a||a.schemaVersion!==1||a.methodVersion!==alignment.methodVersion||a.legacyMethodVersion!==config.methodVersion||
    a.releaseId!==id||a.evaluatedAt!==at||a.crop!=="maize"||a.country!=="US"||a.spatialLevel!==alignment.spatialLevel||
    a.samplingVersion!==alignment.samplingVersion||a.weightMethod!==alignment.weightMethod||a.stageMethod!==alignment.stageMethod||
    a.temporalMethod!==alignment.temporalMethod||!validDate(a.period?.end)||a.period.start!==addDay(a.period.end,-6)||
    !Array.isArray(a.regions)||a.regions.length!==alignment.units.length||!Array.isArray(a.inputVersions)||
    a.inputVersions.some(v=>!hash(v?.contentHash)||v.projectionHash!==v.contentHash)||
    a.provenance?.methodVersion!==a.methodVersion||a.provenance.release!==id||a.provenance.calculatedAt!==at||
    !Array.isArray(a.provenance.inputs)||a.provenance.inputs.length!==a.inputVersions.length||
    a.provenance.inputs.some((p,i)=>p.datasetId!==a.inputVersions[i].datasetId||p.contentHash!==a.inputVersions[i].contentHash||p.vintage!==a.inputVersions[i].vintage)||
    a.interpretation!=="stage-weather-screening-exposure-not-affected-acreage")return false;
  const range=r=>r&&share(r.lower)&&share(r.upper)&&r.lower<=r.upper+1e-10;
  if(!a.regions.every((r,i)=>{
    const u=alignment.units[i];
    if(r?.weatherCovered) {
      const w=r.weather;
      if(!Array.isArray(w?.days)||w.days.length!==7||w.days.some((d,j)=>d.date!==addDay(a.period.start,j)||
        ![d.max,d.min,d.rain,d.rootWetness].every(finite)||d.min>d.max||d.min< -100||d.max>70||d.rain<0||d.rain>2000||!share(d.rootWetness))||
        w.normal?.samples!==30||w.normal.period!==config.baseline||!finite(w.normal.rainP20)||w.normal.rainP20<0||!share(w.normal.rootP20)||
        Math.abs(w.rainTotal-w.days.reduce((s,d)=>s+d.rain,0))>1e-9||
        Math.abs(w.rootMean-w.days.reduce((s,d)=>s+d.rootWetness,0)/7)>1e-9||
        w.heatDays!==w.days.filter(d=>d.max>=35).length)return false;
    }else if(r?.weather!==null)return false;
    return r?.id===u.id&&r.state===u.state&&r.crop==="maize"&&r.point?.lat===u.lat&&r.point.lon===u.lon&&
      r.samplingVersion===a.samplingVersion&&(r.productionWeight===null||share(r.productionWeight))&&
      [r.mapping,r.stageCovered,r.weatherCovered,r.joint].every(v=>typeof v==="boolean")&&r.joint===(r.mapping&&r.productionWeight!==null&&r.stageCovered&&r.weatherCovered)&&
      r.sampleCount===(r.weatherCovered?1:0)&&Array.isArray(r.daily)&&r.daily.length===7&&r.daily.every((d,j)=>{
        if(d.date!==addDay(a.period.start,j))return false;
        if(d.edition&&(!hash(d.edition.rawHash)||!hash(d.edition.parentVersion?.contentHash)||
          !validDate(d.edition.publishedDate)||d.edition.publishedDate>=d.date||!validDate(d.edition.weekEnding)||d.edition.weekEnding>d.date))return false;
        const expected=d.stage?progressDistribution(d.stage.cumulative):null;
        return (!d.stage||expected&&JSON.stringify(expected)===JSON.stringify(d.stage))&&
          (d.status!=="aligned-held-observation"||d.edition&&Date.parse(d.date)-Date.parse(d.edition.publishedDate)<=7*DAY&&expected?.informative);
      })&&r.stageCovered===r.daily.every(d=>d.status==="aligned-held-observation")&&
      ["heat","moisture"].every(f=>[true,false,null].includes(r.screen?.[f])&&(r.joint?
        range(r.exposure?.[f])&&r.screen[f]===stageScreen(r.daily,r.weather).screen[f]&&
        JSON.stringify(r.exposure[f])===JSON.stringify(stageScreen(r.daily,r.weather).exposure[f]):r.screen?.[f]===null&&r.exposure?.[f]===null));
  }))return false;
  const total=filter=>a.regions.filter(r=>r.productionWeight!==null&&filter(r)).reduce((s,r)=>s+r.productionWeight,0),near=(x,y)=>finite(x)&&Math.abs(x-y)<1e-9;
  if(a.coverage===null)return a.regions.every(r=>r.productionWeight===null)&&a.exposure?.heat===null&&a.exposure?.moisture===null&&a.eligibility==="unavailable"&&a.provenance.eligibility==="insufficient";
  const c=a.coverage;
  if(!/^\d{4}$/.test(a.weightYear??"")||a.productionVersion?.datasetId!=="cornProduction"||!hash(a.productionVersion.contentHash)||
    a.regions.some(r=>!Array.isArray(r.inputVersions)||r.inputVersions.some(v=>!hash(v?.contentHash))||
      !r.inputVersions.some(v=>v.datasetId==="cornProduction"&&v.contentHash===a.productionVersion.contentHash)))return false;
  if(!Object.values(c).every(share)||!near(c.production,total(()=>true))||!near(c.mapping,total(r=>r.mapping))||
    !near(c.stage,total(r=>r.mapping&&r.stageCovered))||!near(c.weather,total(r=>r.mapping&&r.weatherCovered))||!near(c.joint,total(r=>r.joint))||
    !near(c.unrepresented,1-c.production)||!near(c.missingJoint,1-c.joint)||!near(c.withinPilotMissingJoint,c.production-c.joint)||
    a.sampleCount!==a.regions.reduce((s,r)=>s+r.sampleCount,0)||
    a.provenance.eligibility!==(!c.joint?"insufficient":"eligible")||
    a.eligibility!==(!c.joint?"unavailable":a.regions.every(r=>r.joint)?"eligible":"partial"))return false;
  return ["heat","moisture"].every(f=>{
    const e=a.exposure?.[f];if(!c.joint)return e===null;
    return range(e)&&e.upper<=c.joint+1e-9&&near(e.lower,a.regions.filter(r=>r.joint).reduce((s,r)=>s+r.productionWeight*r.exposure[f].lower,0))&&
      near(e.upper,a.regions.filter(r=>r.joint).reduce((s,r)=>s+r.productionWeight*r.exposure[f].upper,0))&&
      near(e.screenedStateShare,total(r=>r.joint&&r.screen[f]===true))&&near(e.possibleStateShare,total(r=>r.joint&&r.screen[f]!==false));
  });
}

/** Untrusted wire data must fail closed without breaking the surrounding feed. */
export function validAlignment(a,id,at) {
  try{return validateAlignment(a,id,at);}catch{return false;}
}

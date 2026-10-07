import {config} from "./cornData.js";
import {validMetadata,normalizeMetadata} from "./dataContract.js";
import {datasetHealth,reasonText} from "./dataHealth.js";

export const spatialReasonText=(code,lang="zh")=>({
  crop_grid_unavailable:{zh:"玉米面积网格不可用或损坏",en:"Crop grid unavailable or corrupt"},
  crop_grid_version_mismatch:{zh:"玉米面积网格版本不匹配",en:"Crop-grid version mismatch"},
  weather_grid_incomplete:{zh:"天气日期或网格不完整",en:"Weather dates/grid incomplete"},
  spatial_alignment_failed:{zh:"空间交集未通过核验",en:"Spatial intersection failed validation"},
  partial_spatial_coverage:{zh:"部分空间覆盖，未归一化",en:"Partial spatial coverage; not normalized"},
}[code]?.[lang]??reasonText(code,lang));

export const SPATIAL_METHOD="mapped-corn-weather-production/1";
const GRID="cornbelt-iowa-anchored-9km/1";
export const METRICS=["tmaxDailyMeanC","tmaxPeriodMaximumC","tminDailyMeanC","tminPeriodMinimumC","precipitation14DayMm"];
const keys=["crop","weather","intersection"];
const ids={crop:"cornSpatialCrop",weather:"cornSpatialWeather",intersection:"cornSpatial"};
const number=v=>Number.isFinite(v)&&v>=0;
const hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const day=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const timestamp=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(.01,Math.abs(b)*1e-9);
const stats=v=>v===null||v&&["min","p10","p50","p90","max","mean"].every(k=>Number.isFinite(v[k]))&&
  v.min<=v.p10&&v.p10<=v.p50&&v.p50<=v.p90&&v.p90<=v.max&&v.mean>=v.min&&v.mean<=v.max;
const period=p=>p&&day(p.start)&&day(p.end)&&Date.parse(p.end)-Date.parse(p.start)===13*86400000;

/** Validate display-facing arithmetic separately from source retrieval health. */
export function validSpatial(a,releaseId,at) {
  if(!a||a.schemaVersion!==1||a.methodVersion!==SPATIAL_METHOD||a.gridVersion!==GRID||!period(a.period)||
    !hash(a.analysisHash)||!timestamp(a.generatedAt)||a.generatedAt.slice(0,10)<a.period.end||
    (releaseId!==undefined&&(a.releaseId!==releaseId||a.evaluatedAt!==at||a.generatedAt>at))||
    !Array.isArray(a.states)||a.states.length!==config.regions.length||
    a.states.some((s,i)=>s.state!==config.regions[i].id))return false;
  for(const s of a.states) {
    if(!["ok","unavailable"].includes(s.status)||s.methodVersion!==SPATIAL_METHOD||s.gridVersion!==GRID||
       s.localStageEligibility!=="insufficient"||s.period?.start!==a.period.start||s.period?.end!==a.period.end||
       !number(s.validWeatherAreaM2)||!Array.isArray(s.reasons)||
       !keys.every(k=>validMetadata(s.records?.[k]?.metadata)&&
         s.records[k].metadata.datasetId===`${ids[k]}/${s.state}`))return false;
    if(s.mappedCornAreaM2===null) {
      if(s.status!=="unavailable"||s.coverage!==null||s.missingAreaM2!==null||s.validWeatherAreaM2!==0)return false;
    } else if(!number(s.mappedCornAreaM2)||s.mappedCornAreaM2<=0||!close(s.missingAreaM2+s.validWeatherAreaM2,s.mappedCornAreaM2)||
      !close(s.coverage,s.validWeatherAreaM2/s.mappedCornAreaM2)||s.coverage<0||s.coverage>1+1e-9)return false;
    if(s.status==="ok") {
      if(s.spatialMethod!=="mapped-corn-area-weighted"||!hash(s.annualKey)||!Number.isInteger(s.cropGeographyYear)||
        !["year-specific","validated-older-geography-proxy"].includes(s.geographyUse)||
        s.cropGeographyYear>Number(s.period.end.slice(0,4))||
        (s.geographyUse==="year-specific")!==(s.cropGeographyYear===Number(s.period.end.slice(0,4)))||
        !day(s.cropGeographyPublicationDate)||s.validWeatherAreaM2<=0||!METRICS.every(k=>stats(s.weatherSummary?.[k])&&s.weatherSummary[k])||
        !["tmmx","tmmn","pr"].every(k=>Array.isArray(s.weatherVersions?.[k])&&s.weatherVersions[k].length&&s.weatherVersions[k].every(v=>
          hash(v.contentHash)&&hash(v.rawFileHash)&&Array.isArray(v.expectedDates)&&Array.isArray(v.missingDates))))return false;
      const d=s.records.intersection.data;
      if(s.records.intersection.status!=="ok"||d?.annualKey!==s.annualKey||!close(d.mappedCornAreaM2,s.mappedCornAreaM2)||
        !close(d.validWeatherAreaM2,s.validWeatherAreaM2)||d.period?.end!==s.period.end||
        JSON.stringify(d.weatherSummary)!==JSON.stringify(s.weatherSummary))return false;
    } else if(s.records.intersection.status!=="error"||s.validWeatherAreaM2!==0)return false;
  }
  const c=a.combined,ok=a.states.filter(s=>s.status==="ok"),unknown=a.states.filter(s=>s.mappedCornAreaM2===null);
  const known=a.states.reduce((sum,s)=>sum+(s.mappedCornAreaM2??0),0),joint=ok.reduce((sum,s)=>sum+s.validWeatherAreaM2,0);
  return c?.scope==="ten-state-corn-belt-only"&&c.spatialMethod==="mapped-corn-area-weighted"&&
    validMetadata(c.record?.metadata)&&c.record.metadata.datasetId==="cornSpatial/ten-state"&&
    c.methodVersion===SPATIAL_METHOD&&c.gridVersion===GRID&&c.localStageEligibility==="insufficient"&&
    c.period?.start===a.period.start&&c.period?.end===a.period.end&&close(c.knownMappedCornAreaM2,known)&&close(c.validWeatherAreaM2,joint)&&
    JSON.stringify(c.includedStates)===JSON.stringify(ok.map(s=>s.state))&&
    JSON.stringify(c.unavailableStates)===JSON.stringify(a.states.filter(s=>s.status!=="ok").map(s=>s.state))&&
    JSON.stringify(c.unknownGeographyStates)===JSON.stringify(unknown.map(s=>s.state))&&
    (unknown.length?c.mappedCornAreaM2===null&&c.coverage===null&&c.missingAreaM2===null:
      close(c.mappedCornAreaM2,known)&&close(c.coverage,joint/known)&&close(c.missingAreaM2,known-joint))&&
    METRICS.every(k=>stats(c.weatherSummary?.[k])&&(joint===0?c.weatherSummary[k]===null:
      c.weatherSummary[k]&&close(c.weatherSummary[k].mean,ok.reduce((sum,s)=>sum+s.weatherSummary[k].mean*s.validWeatherAreaM2,0)/joint)&&
      close(c.weatherSummary[k].min,Math.min(...ok.map(s=>s.weatherSummary[k].min)))&&
      close(c.weatherSummary[k].max,Math.max(...ok.map(s=>s.weatherSummary[k].max)))))&&
    Array.isArray(c.contributingInputs)&&c.contributingInputs.length===ok.length&&
    c.contributingInputs.every((v,i)=>v.state===ok[i].state&&v.annualKey===ok[i].annualKey&&
      JSON.stringify(v.weatherVersions)===JSON.stringify(ok[i].weatherVersions));
}

export function spatialHealth(a,{now=Date.now(),release=null}={}) {
  const valid=validSpatial(a),rows=[];
  for(const s of a?.states??[])for(const component of keys) {
    const key=ids[component],r=s.records?.[component];
    const age=(now-Date.parse(s.period?.end))/86400000;
    const h=datasetHealth(r,{key,valid:valid&&r?.metadata?.datasetId===`${key}/${s.state}`&&!!normalizeMetadata(r,key),
      eligible:valid&&(component==="crop"?s.mappedCornAreaM2>0:s.status==="ok"),
      publication:component==="crop"?"current":age>=0&&age<=10?"current":"overdue",now,release,
      ruleId:"informational-spatial-weather"});
    if(component!=="crop"&&s.reasons?.includes("partial_spatial_coverage"))h.reasons.push("coverage_incomplete");
    rows.push({id:`${key}/${s.state}`,...h});
  }
  if(a?.combined) {
    const age=(now-Date.parse(a.period.end))/86400000;
    rows.push({id:"cornSpatial/ten-state",...datasetHealth(a.combined.record,{key:"cornSpatial",
      valid,eligible:valid&&a.combined.coverage!==null&&a.combined.validWeatherAreaM2>0,
      publication:age>=0&&age<=10?"current":"overdue",now,release,ruleId:"informational-spatial-weather"})});
  }
  return rows;
}

/** Selection is explicit. Level A is NEVER returned with a Level C label. */
export function selectSpatial(s,levelA,health=[],{now=Date.now(),artifactValid=true}={}) {
  const h=health.find(r=>r.id===`cornSpatial/${s?.state}`);
  if(artifactValid&&s?.status==="ok"&&h?.analysisUsable&&Date.parse(s.period.end)<=now&&now-Date.parse(s.period.end)<=10*86400000)
    return {method:"mapped-corn-area-weighted",state:s,weather:s.weatherSummary,period:s.period};
  const pointHealth=health.find(r=>r.id===`weather/corn-${levelA?.id}`);
  if(levelA?.weather&&pointHealth?.analysisUsable&&day(levelA.period?.end)&&Date.parse(levelA.period.end)<=now&&now-Date.parse(levelA.period.end)<=10*86400000)
    return {method:"representative-point-fallback",weather:levelA.weather,period:levelA.period};
  return {method:"unavailable",weather:null,period:null};
}

import {datasetHealth} from "./dataHealth.js";
import {validSourceData} from "./officialSources.js";
import {validateEnsoBundle, strengthOutlookSummary} from "./ensoOutlook.js";
import {validateDroughtBundle} from "./droughtMonitor.js";
import {config as cornConfig,validCornData,validCornBaseline} from "./cornData.js";
import {spatialHealth} from "./cornSpatial.js";
const safe = fn => {try {return fn();} catch {return false;}};

export function validPointData(record, point, soil=false, now=Date.now()) {
  const days=Array.isArray(record?.days)?record.days.slice(-30):null;
  const source=safe(()=>new URL(record.url));
  const params=source?.searchParams;
  const requested=new Set(params?.get("parameters")?.split(","));
  return Boolean(source?.origin==="https://power.larc.nasa.gov" && source.pathname==="/api/temporal/daily/point" &&
    params.get("time-standard")==="UTC" && params.get("community")==="AG" && params.has("latitude") && params.has("longitude") &&
    (soil?["GWETROOT","GWETTOP"]:["T2M_MAX","T2M_MIN","PRECTOTCORR"]).every(k=>requested.has(k)) &&
    +params.get("latitude")===point.lat && +params.get("longitude")===point.lon && days?.length && days.every((d,i)=>{
      if(!d||typeof d!=="object")return false;
      const time=Date.parse(d.date);
      return /^\d{4}-\d{2}-\d{2}$/.test(d.date)&&Number.isFinite(time)&&time<=now&&new Date(time).toISOString().slice(0,10)===d.date&&
        (!i||time-Date.parse(days[i-1].date)===86400000)&&(soil?
          [d.rootWetness,d.surfaceWetness].every(v=>Number.isFinite(v)&&v>=0&&v<=1):
          [d.min,d.max,d.rain].every(Number.isFinite)&&d.min>=-100&&d.min<=d.max&&d.max<=70&&d.rain>=0&&d.rain<=2000);
    }));
}

/** Release-bound diagnostic snapshot. The pure health interpreter is also used
 * directly by pages/rules; this collector never introduces market judgments. */
export function buildDataHealth({official,weather,drought,enso,points=[],now=Date.now(),evidence={}}={}) {
  const datasets=[];
  const add=(id,record,options)=>datasets.push({id,...datasetHealth(record,{now,...options})});
  for (const key of ["fao","usda","worldBank","eia","noaa"])
    add(key,official?.sources?.[key],{key,valid:!!safe(()=>validSourceData(key,official?.sources?.[key]?.data)),
      eligible:evidence[key]===true,ruleId:["fao","worldBank"].includes(key)?"monthly-change":"context"});
  for(const point of points) for(const key of ["weather","soil"]) {
    const record=weather?.points?.[point.id];
    add(`${key}/${point.id}`,record,{key,pointId:point.id,valid:weather?.schemaVersion===1&&validPointData(record,point,key==="soil",now),
      eligible:evidence[key]?.has(point.id)??false,ruleId:key==="soil"?"soil-current-month":"heat-window"});
  }
  add("drought",drought,{key:"drought",valid:!!safe(()=>validateDroughtBundle(drought,now)),
    verified:drought?.periodVerified===true&&Object.values(drought?.maps??{}).every(m=>
      m.periodVerified!==false&&m.productPeriodVerified!==false&&m.availablePeriodVerified!==false),
    eligible:(evidence.drought?.size??0)>0,ruleId:"drought-short-term"});
  add("enso",enso,{key:"enso",valid:!!safe(()=>validateEnsoBundle(enso,now)),eligible:evidence.enso===true});
  const extracted=!!safe(()=>strengthOutlookSummary(enso?.data));
  datasets.at(-1).strengthEvidence={ruleId:"enso-strength",extracted,
    eligible:extracted&&datasets.at(-1).analysisUsable,
    reason:extracted&&datasets.at(-1).analysisUsable?null:"insufficient_evidence"};
  const corn=official?.cornPilot;
  for(const key of ["cornProduction","cornProgress"])
    add(key,corn?.sources?.[key],{key,valid:!!safe(()=>validCornData(key,corn?.sources?.[key],now)),ruleId:"corn-context"});
  for(const region of cornConfig.regions) {
    const record=corn?.weather?.[region.id],id=`corn-${region.id}`;
    add(`weather/${id}`,record,{key:"weather",pointId:id,
      valid:!!record?.metadata&&validPointData(record,region,false,now)&&validPointData(record,region,true,now),ruleId:"corn-seven-day-window"});
    add(`cornBaseline/${region.id}`,corn?.baselines?.[region.id],{key:"cornBaseline",
      valid:!!safe(()=>validCornBaseline(corn?.baselines?.[region.id],region)),ruleId:"corn-matched-calendar-normal"});
  }
  return {schemaVersion:1,assessedAt:new Date(now).toISOString(),release:null,datasets};
}

/** Informational diagnostics are attached after legacy alert evaluation, so
 * adding a dataset cannot change the frozen alert health inputs or emails. */
export function addSpatialDataHealth(snapshot,artifact,{now,release}) {
  snapshot.datasets.push(...spatialHealth(artifact,{now,release}));
  return snapshot;
}

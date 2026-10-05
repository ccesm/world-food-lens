import config from "../data/cornPilot.json" with {type:"json"};
export {config};
export const CORN_STAGES=["planted","emerged","silking","dough","dented","mature","harvested"];
export const CONDITION_FIELDS=["veryPoor","poor","fair","good","excellent"];
const hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const percent=v=>Number.isInteger(v)&&v>=0&&v<=100;
const positive=v=>Number.isFinite(v)&&v>0;
const quantities=r=>r&&[r.production,r.harvestedArea,r.yield].every(positive)&&Math.abs(r.harvestedArea*r.yield-r.production)/r.production<=.015;
const regions=rows=>rows&&Object.keys(rows).length===config.regions.length&&config.regions.every(r=>Object.hasOwn(rows,r.id));
export function validCornData(key,record,now) {
  const d=record?.data,m=record?.metadata;
  if(!d||!hash(d.rawHash)||!m||m.datasetId!==key||record.source?.url!==config[key==="cornProduction"?"productionSource":"progressSource"]||
     !/^https:\/\/esmis\.nal\.usda\.gov\/sites\/default\/release-files\/[^?#]+\.txt$/.test(record.source?.downloadUrl??"")||
     !validDate(d.publishedDate)||Date.parse(d.publishedDate)>now||m.observation?.vintage!==d.publishedDate.slice(0,7)||
     m.extensions?.publicationDate!==d.publishedDate||!regions(d.regions))return false;
  if(key==="cornProduction")return /^\d{4}$/.test(d.year)&&d.year<d.publishedDate.slice(0,4)&&record.source.period===d.year&&
    d.unit==="1000 bushels"&&d.areaUnit==="1000 acres"&&d.yieldUnit==="bushels/acre"&&quantities(d.national)&&
    Object.values(d.regions).every(quantities)&&Object.values(d.regions).reduce((s,r)=>s+r.production,0)<=d.national.production;
  return validProgress(d,now)&&record.source.period===d.weekEnding&&Array.isArray(d.history)&&d.history.length<=12&&d.history.length>0&&
    d.history.every((r,i)=>validProgress(r,now)&&r.weekEnding<=d.weekEnding&&(!i||r.weekEnding>d.history[i-1].weekEnding))&&
    JSON.stringify(d.history.at(-1).regions)===JSON.stringify(d.regions)&&d.history.at(-1).publishedDate===d.publishedDate;
}
export function validProgress(d,now) {
  return validDate(d?.weekEnding)&&validDate(d.publishedDate)&&hash(d.rawHash)&&regions(d.regions)&&
    Date.parse(d.publishedDate)<=now&&Date.parse(d.publishedDate)>=Date.parse(d.weekEnding)&&
    Date.parse(d.publishedDate)-Date.parse(d.weekEnding)<=3*86400000&&
    Object.values(d.regions).every(r=>{
      const p=r?.progress,condition=r?.condition;
      if(!p||Object.keys(p).some(k=>!CORN_STAGES.includes(k))||!Object.values(p).every(percent))return false;
      const stages=CORN_STAGES.filter(k=>Object.hasOwn(p,k)).map(k=>p[k]);
      if(stages.some((v,i)=>i>0&&v>stages[i-1]))return false;
      return (stages.length>0||condition!==null)&&(condition===null||CONDITION_FIELDS.every(k=>percent(condition?.[k]))&&
        CONDITION_FIELDS.reduce((s,k)=>s+condition[k],0)===100);
    });
}
export function validCornBaseline(record,region) {
  const d=record?.data;
  let url;try{url=new URL(record.source.downloadUrl);}catch{return false;}
  if(!d||record.metadata?.datasetId!==`cornBaseline/${region.id}`||d.baseline!=="1991-2020"||d.windowDays!==7||
     d.lat!==region.lat||d.lon!==region.lon||record.source.period!=="1991-2020"||!hash(d.rawHash)||
     url.origin!=="https://power.larc.nasa.gov"||url.pathname!=="/api/temporal/daily/point"||
     url.searchParams.get("time-standard")!=="UTC"||url.searchParams.get("community")!=="AG"||
     +url.searchParams.get("latitude")!==region.lat||+url.searchParams.get("longitude")!==region.lon||
     url.searchParams.get("start")!=="19901226"||url.searchParams.get("end")!=="20201231"||
     !["T2M_MAX","PRECTOTCORR","GWETROOT"].every(p=>url.searchParams.get("parameters")?.split(",").includes(p))||
     !d.windows||Object.keys(d.windows).length!==365)return false;
  return Object.entries(d.windows).every(([md,w])=>validDate(`2001-${md}`)&&w?.samples===30&&
    [w.maxMean,w.rainMean,w.rainP20,w.rootMean,w.rootP20].every(Number.isFinite)&&
    w.maxMean>=-100&&w.maxMean<=70&&w.rainMean>=0&&w.rainMean<=14000&&w.rainP20>=0&&w.rainP20<=14000&&
    w.rootMean>=0&&w.rootMean<=1&&w.rootP20>=0&&w.rootP20<=1);
}

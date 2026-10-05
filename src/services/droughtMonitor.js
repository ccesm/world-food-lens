import {freshCheck, publicationState} from "./dataHealth.js";
const DAY=86400000;
const GDO_URL="https://drought.emergency.copernicus.eu/api/wms?";
const SPI=new Set(["extremely-dry","severely-dry","moderately-dry","near-normal","moderately-wet","very-wet","extremely-wet","no-data"]);
const IMPACT=new Set(["high","medium","low","no-hotspot"]);
const MAX_AGE={shortTerm:35,longTerm:75,impactRisk:45};

export function validateDroughtBundle(bundle,now=Date.now()){
  if(!Number.isFinite(now))return null;
  if(bundle?.schemaVersion!==1||!bundle.maps||!bundle.points||typeof bundle.points!=="object")return null;
  for(const key of Object.keys(MAX_AGE)){
    const map=bundle.maps[key];
    if(!map||!/^20\d\d-\d\d-\d\d$/.test(map.period)||!Number.isFinite(Date.parse(`${map.period}T00:00:00Z`))||
      typeof map.url!=="string"||!map.url.startsWith(GDO_URL))return null;
  }
  for(const point of Object.values(bundle.points)){
    if(!point||!SPI.has(point.shortTerm)||!SPI.has(point.longTerm)||!IMPACT.has(point.impactRisk))return null;
  }
  const stale=!freshCheck(bundle,now);
  return {...bundle,stale};
}

export async function loadDroughtMonitor(signal){
  const response=await fetch(`${import.meta.env.BASE_URL}data/drought-monitor.json`,{cache:"no-store",signal});
  if(!response.ok)throw new Error("Drought monitor unavailable");
  return validateDroughtBundle(await response.json());
}

export function droughtPointSummary(bundle,pointId,now=Date.now()){
  const valid=validateDroughtBundle(bundle,now),point=valid?.points?.[pointId];
  if(!valid||!point)return null;
  const layers={};
  for(const [key,maxAge] of Object.entries(MAX_AGE)){
    const map=valid.maps[key],age=Math.floor((now-Date.parse(`${map.period}T00:00:00Z`))/DAY);
    layers[key]={value:point[key],period:map.period,url:map.url,age,stale:age<0||age>maxAge||valid.stale};
  }
  const verified=valid.periodVerified===true&&Object.values(valid.maps).every(map=>
    map.periodVerified!==false&&map.availablePeriodVerified!==false&&map.productPeriodVerified!==false);
  return {layers,stale:valid.stale,interpret:verified&&!layers.shortTerm.stale&&point.shortTerm!=="no-data"};
}

export function droughtVerificationLabel(bundle,lang){
  const labels={
    "availability-metadata-unavailable":["官方日期目录暂时无法获取", "Official time metadata could not be retrieved"],
    "availability-metadata-invalid":["官方时间目录格式或时间步不一致", "Official time metadata is malformed or its timestep is inconsistent"],
    "period-not-in-authoritative-time-set":["请求日期不在官方可用时间集合中", "Requested date is not in the authoritative available-time set"],
    "returned-product-period-unverified":["日期在官方目录中，但返回图像的观测日期无法确认", "Date is listed, but the returned image's observation date cannot be confirmed"],
  };
  return (labels[bundle?.periodVerification?.reason]??["资料日期尚未可靠核实", "Observation date has not been reliably verified"])[lang==="en"?1:0];
}

function soilBand(value,normal){
  if(value<=normal.p10)return "very-dry";
  if(value<=normal.p25)return "drier";
  if(value>=normal.p90)return "very-wet";
  if(value>=normal.p75)return "wetter";
  return "near-normal";
}

function validNormal(normal){
  return normal&&[normal.p10,normal.p25,normal.median,normal.p75,normal.p90].every(Number.isFinite)&&
    normal.p10<=normal.p25&&normal.p25<=normal.median&&normal.median<=normal.p75&&normal.p75<=normal.p90&&
    normal.p10>=0&&normal.p90<=1;
}

export function soilMoistureSummary(record,selectedMonth,year,now=Date.now()){
  if(!Number.isFinite(now)||!Number.isInteger(year)||!Number.isInteger(selectedMonth)||selectedMonth<1||selectedMonth>12||!Array.isArray(record?.days))return null;
  const period=`${year}-${String(selectedMonth).padStart(2,"0")}`,current=new Date(now).toISOString().slice(0,7);
  if(period>current)return null;
  const days=record.days.filter(row=>row?.date?.startsWith(`${period}-`));
  if(!days.length)return null;
  const monthLength=new Date(Date.UTC(year,selectedMonth,0)).getUTCDate();
  if(days[0].date!==`${period}-01`||(period<current&&days.length!==monthLength))return null;
  for(let i=0;i<days.length;i++){
    const row=days[i],time=Date.parse(row.date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(time)||(i&&time-Date.parse(days[i-1].date)!==DAY)||
      ![row.rootWetness,row.surfaceWetness].every(value=>Number.isFinite(value)&&value>=0&&value<=1))return null;
  }
  const normals=record.soilClimatology?.months?.[String(selectedMonth).padStart(2,"0")];
  if(record.soilClimatology?.baseline!=="1991–2020"||!validNormal(normals?.root)||!validNormal(normals?.surface))return null;
  const average=key=>days.reduce((total,row)=>total+row[key],0)/days.length;
  const root=average("rootWetness"),surface=average("surfaceWetness"),historical=period<current;
  const stale=!freshCheck(record,now)||(!historical&&publicationState("soil",days.at(-1).date,now)!=="current");
  return {start:days[0].date,end:days.at(-1).date,days:days.length,partial:days.length<monthLength,historical,stale,
    baseline:record.soilClimatology.baseline,root,surface,rootBand:soilBand(root,normals.root),surfaceBand:soilBand(surface,normals.surface),
    rootNormal:normals.root,surfaceNormal:normals.surface,interpret:historical||!stale};
}

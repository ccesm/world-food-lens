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
  const fetched=Date.parse(bundle.fetchedAt);
  const stale=bundle.status!=="ok"||!Number.isFinite(fetched)||fetched>now+300000||now-fetched>3*DAY;
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
  return {layers,stale:valid.stale,interpret:!layers.shortTerm.stale&&point.shortTerm!=="no-data"};
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
  const fetched=Date.parse(record.fetchedAt),lag=(now-Date.parse(`${days.at(-1).date}T00:00:00Z`))/DAY;
  const stale=record.status!=="ok"||!Number.isFinite(fetched)||fetched>now+300000||now-fetched>3*DAY||(!historical&&lag>10);
  return {start:days[0].date,end:days.at(-1).date,days:days.length,partial:days.length<monthLength,historical,stale,
    baseline:record.soilClimatology.baseline,root,surface,rootBand:soilBand(root,normals.root),surfaceBand:soilBand(surface,normals.surface),
    rootNormal:normals.root,surfaceNormal:normals.surface,interpret:historical||!stale};
}

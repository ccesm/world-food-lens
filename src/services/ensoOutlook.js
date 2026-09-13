import {cropCalendars,STAGES} from "../data/cropCalendars.js";
import {seasonalClimateSignals,SIGNAL_REVIEWED} from "../data/seasonalClimateSignals.js";

const MONTH=/^20\d\d-(0[1-9]|1[0-2])$/;
export function validateEnsoBundle(bundle,now=Date.now()) {
  const data=bundle?.data;
  if(bundle?.schemaVersion!==1||!data||!Array.isArray(data.forecasts)||data.forecasts.length!==9||!/^20\d\d-\d\d-\d\d$/.test(data.issuedAt)||!Number.isFinite(Date.parse(data.issuedAt)))return null;
  if(!["el-nino","la-nina","neutral"].includes(data.phase)||!Number.isFinite(data.nino34)||!MONTH.test(data.nino34Month))return null;
  const issue=Date.parse(`${data.issuedAt}T00:00:00Z`);
  if(issue>now+86400000)return null;
  let previous="";
  for(const row of data.forecasts){
    if(!MONTH.test(row.startMonth)||row.startMonth<=previous||!/^[A-Z]{3}$/.test(row.season))return null;
    const total=row.elNino+row.neutral+row.laNina;
    if(![row.elNino,row.neutral,row.laNina].every(x=>Number.isFinite(x)&&x>=0&&x<=100)||Math.abs(total-100)>1)return null;
    if(!Array.isArray(row.roniPercentiles)||row.roniPercentiles.length!==7||!row.roniPercentiles.every((v,i,a)=>Number.isFinite(v)&&(i===0||v>=a[i-1])))return null;
    previous=row.startMonth;
  }
  const fetched=Date.parse(bundle.fetchedAt);
  return {...bundle,stale:bundle.status!=="ok"||!Number.isFinite(fetched)||now-fetched>7*86400000||now-issue>45*86400000};
}

export async function loadEnsoOutlook(signal) {
  const response=await fetch(`${import.meta.env.BASE_URL}data/enso-outlook.json`,{cache:"no-store",signal});
  if(!response.ok)throw new Error("ENSO outlook unavailable");
  return validateEnsoBundle(await response.json());
}

export function monthSpan(start,end) {
  if(!MONTH.test(start)||!MONTH.test(end)||start>end)return [];
  const result=[];let [year,month]=start.split("-").map(Number);
  while(`${year}-${String(month).padStart(2,"0")}`<=end&&result.length<24){result.push(`${year}-${String(month).padStart(2,"0")}`);month++;if(month===13){month=1;year++;}}
  return result;
}

export function cropSignalOverlap(signal,fromMonth=signal.start) {
  const crop=cropCalendars.find(row=>row.id===signal.cropId);
  if(!crop)return null;
  const stages=monthSpan(fromMonth>signal.start?fromMonth:signal.start,signal.end).map(period=>({period,code:crop.months[Number(period.slice(5))-1]}));
  const critical=stages.filter(row=>row.code==="F"||row.code==="G");
  return {crop,stages,critical,peakSensitivity:Math.max(0,...critical.map(row=>STAGES[row.code].sensitivity))};
}

export function activeRegionalSignals(now=Date.now()) {
  const today=new Date(now);
  if(!Number.isFinite(now)||!Number.isFinite(today.getTime()))return {stale:true,signals:[]};
  const current=`${today.getUTCFullYear()}-${String(today.getUTCMonth()+1).padStart(2,"0")}`;
  const reviewed=Date.parse(`${SIGNAL_REVIEWED}T00:00:00Z`);
  const stale=!Number.isFinite(now)||now<reviewed||now-reviewed>45*86400000;
  return {stale,signals:seasonalClimateSignals.filter(row=>row.end>=current&&row.issuedAt<=today.toISOString().slice(0,10))};
}

export function forecastWatchIntersections(now=Date.now()) {
  const {stale,signals}=activeRegionalSignals(now);
  if(stale)return [];
  const currentMonth=new Date(now).toISOString().slice(0,7);
  return signals.map(signal=>({signal,overlap:cropSignalOverlap(signal,currentMonth)}))
    .filter(row=>row.overlap?.stages.length)
    .sort((a,b)=>b.overlap.peakSensitivity-a.overlap.peakSensitivity||a.signal.start.localeCompare(b.signal.start));
}

import {cropCalendars,STAGES} from "../data/cropCalendars.js";
import {freshCheck, publicationState} from "./dataHealth.js";
import {agriculturalExposureProfiles,seasonalClimateSignals,SIGNAL_REVIEWED} from "../data/seasonalClimateSignals.js";

const MONTH=/^20\d\d-(0[1-9]|1[0-2])$/;

export function strengthOutlookSummary(data,lang="zh") {
  const evidence=data?.strengthEvidence,probability=evidence?.probability,event=evidence?.event,period=evidence?.period;
  const operators={gt:">",gte:"≥",eq:"",lt:"<",lte:"≤"};
  // Legacy strengthOutlook tags have no auditable probability or valid period.
  if(evidence?.status!=="extracted"||evidence.reason!=="explicit-probability-event-period"||
    typeof data.issuedAt!=="string"||!/^20\d\d-\d\d-\d\d$/.test(data.issuedAt)||
    evidence.issuedAt!==data.issuedAt||
    evidence.sourceUrl!=="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml"||
    typeof evidence.sourceText!=="string"||!evidence.sourceText.trim()||
    !probability||!Object.hasOwn(operators,probability.operator)||!Number.isFinite(probability.percent)||probability.percent<0||probability.percent>100||
    (probability.operator==="gt"&&probability.percent===100)||(probability.operator==="lt"&&probability.percent===0)||
    !["el-nino","la-nina"].includes(event?.phase)||!["strong","very-strong"].includes(event?.strength)||
    !MONTH.test(period?.startMonth)||!MONTH.test(period?.endMonth)||period.startMonth>period.endMonth||
    typeof period.label!=="string"||!period.label.trim()||
    !Array.isArray(data.forecasts)||!data.forecasts.length||!MONTH.test(data.forecasts[0]?.startMonth)||!MONTH.test(data.forecasts.at(-1)?.startMonth)||
    period.startMonth<data.forecasts[0].startMonth||period.endMonth<data.issuedAt.slice(0,7)||
    period.endMonth>addMonths(data.forecasts.at(-1).startMonth,2))return null;
  const chance=`${operators[probability.operator]}${probability.percent}%`,dates=`${period.startMonth} → ${period.endMonth}`;
  const zh=lang==="zh",phase=event.phase==="el-nino"?(zh?"厄尔尼诺":"El Niño"):(zh?"拉尼娜":"La Niña");
  const strength=event.strength==="very-strong"?(zh?"非常强":"very strong"):(zh?"强":"strong");
  return {...evidence,text:zh?`NOAA：${strength}${phase}事件概率 ${chance} · ${dates}`:
    `NOAA: ${chance} chance of a ${strength} ${phase} event · ${dates}`};
}

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
  return {...bundle,stale:!freshCheck(bundle,now)||!["current","awaiting"].includes(publicationState("enso",data.issuedAt,now))};
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

export function agriculturalExposureRows(now=Date.now()) {
  if(!Number.isFinite(now))return [];
  const {stale,signals}=activeRegionalSignals(now);
  const currentMonth=new Date(now).toISOString().slice(0,7);
  return agriculturalExposureProfiles.map(profile=>{
    const calendar=cropCalendars.find(row=>row.id===profile.cropId);
    const signal=profile.currentSignalId?signals.find(row=>row.id===profile.currentSignalId):null;
    const overlap=signal?cropSignalOverlap(signal,currentMonth):null;
    const months=overlap?.stages??monthSpan(currentMonth,addMonths(currentMonth,2)).map(period=>({period,code:calendar?.months[Number(period.slice(5))-1]??"-"}));
    const critical=months.some(row=>["F","G"].includes(row.code));
    return {...profile,calendar,signal:stale?null:signal,adjacentForecast:stale?null:profile.adjacentForecast,regionalOutlookStale:stale,months,critical,
      watch:stale||!signal?"no-current-match":critical?"critical-window":"forecast-overlap",
      observed:"no-climate-normal",agriculturalRisk:"not-rated"};
  });
}

function addMonths(period,count) {
  const [year,month]=period.split("-").map(Number),date=new Date(Date.UTC(year,month-1+count,1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
}

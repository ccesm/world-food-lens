const HOUR=60*60*1000;
export const ALERT_FEED_MAX_AGE=72*HOUR;
const text=value=>typeof value==="string"&&value.trim().length>0;
const bilingual=value=>value&&text(value.zh)&&text(value.en);
const timestamp=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&
  new Date(value).toISOString()===(value.includes(".")?value:value.replace("Z",".000Z"));
const httpsUrl=value=>{try{return typeof value==="string"&&new URL(value).protocol==="https:";}catch{return false;}};
const validAlert=alert=>alert&&text(alert.id)&&["crop","market","system"].includes(alert.category)&&
  ["yellow","red"].includes(alert.severity)&&["active","unverified"].includes(alert.state)&&
  [alert.title,alert.summary,alert.rule].every(bilingual)&&text(alert.sourcePeriod)&&
  typeof alert.target==="string"&&/^#[a-zA-Z][\w-]*$/.test(alert.target)&&
  timestamp(alert.firstSeenAt)&&timestamp(alert.lastEvaluatedAt)&&Date.parse(alert.firstSeenAt)<=Date.parse(alert.lastEvaluatedAt)&&
  Array.isArray(alert.sources)&&alert.sources.every(source=>source&&text(source.label)&&httpsUrl(source.url)&&text(source.period));

/** Invalid evidence fails closed; old, otherwise valid evidence remains readable as an archive. */
export function validateAlertFeed(feed,now=Date.now()){
  if(!Number.isFinite(now)||feed?.schemaVersion!==1||feed.rulesVersion!=="1"||!timestamp(feed.generatedAt)||
    !Array.isArray(feed.active)||!Array.isArray(feed.events)||feed.events.length>200||!Array.isArray(feed.health)||
    !bilingual(feed.coverage?.automatic)||!bilingual(feed.coverage?.manual)||
    !["not-configured","configured","sent","failed"].includes(feed.email?.status)||
    (feed.email.lastSentAt!==undefined&&!timestamp(feed.email.lastSentAt))||
    (feed.email.lastAttemptAt!==undefined&&!timestamp(feed.email.lastAttemptAt)))return null;
  const generated=Date.parse(feed.generatedAt);
  if(!feed.active.every(validAlert)||new Set(feed.active.map(alert=>alert.id)).size!==feed.active.length||
    feed.active.some(alert=>Date.parse(alert.lastEvaluatedAt)>generated+300000))return null;
  if(!feed.events.every(event=>event&&text(event.id)&&text(event.alertId)&&
    ["new","escalated","resolved","verification-lost","reconfirmed"].includes(event.type)&&
    timestamp(event.at)&&Date.parse(event.at)<=generated+300000&&validAlert(event.alert)&&event.alert.id===event.alertId)||
    new Set(feed.events.map(event=>event.id)).size!==feed.events.length)return null;
  if(!feed.health.every(source=>source&&text(source.id)&&bilingual(source.label)&&bilingual(source.reason)&&
    ["ok","unavailable"].includes(source.status)&&(source.period===undefined||text(source.period))&&
    (source.fetchedAt===undefined||timestamp(source.fetchedAt)))||
    new Set(feed.health.map(source=>source.id)).size!==feed.health.length)return null;
  return {...feed,stale:generated>now+300000||now-generated>ALERT_FEED_MAX_AGE};
}

export function alertOverview(feed,{now=Date.now(),failed=false}={}){
  const valid=validateAlertFeed(feed,now),archive=!valid||valid.stale||failed;
  const active=archive?[]:valid.active.filter(alert=>alert.state==="active");
  return {archive,red:active.filter(alert=>alert.severity==="red").length,
    yellow:active.filter(alert=>alert.severity==="yellow").length,
    unverified:valid?.active.filter(alert=>alert.state==="unverified").length??0,
    unavailable:valid?.health.filter(source=>source.status!=="ok").length??0};
}

export async function loadAlertFeed(signal){
  const response=await fetch(`${import.meta.env.BASE_URL}data/monitor-alerts.json`,{cache:"no-store",signal});
  if(!response.ok)throw new Error("Alert feed unavailable");
  const feed=validateAlertFeed(await response.json());
  if(!feed)throw new Error("Alert feed invalid");
  return feed;
}

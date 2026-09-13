import {ALERT_REVIEWED,cropWeatherAlerts} from "../data/cropWeatherAlerts.js";
export function alertSnapshot(now=Date.now(),level="all") {
  const date=new Date(now),review=Date.parse(`${ALERT_REVIEWED}T00:00:00Z`);
  const stale=!Number.isFinite(date.getTime())||now<review||now-review>30*86400000;
  const rows=cropWeatherAlerts.filter(r=>r.year===date.getUTCFullYear()&&Date.parse(r.source.date)<=now);
  return {stale,rows:rows.filter(r=>level==="all"||r.level===level),red:rows.filter(r=>r.level==="red").length,yellow:rows.filter(r=>r.level==="yellow").length};
}

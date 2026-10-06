import {releaseSources} from "../data/releaseSchedule.js";
import spec from "../data/dataContract.json" with {type:"json"};

const DAY = 86400000;
const month = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "");
const monthAt = (now, offset = 0) => {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
};
export function publicationState(key, period, now = Date.now()) {
  if (!Number.isFinite(now) || typeof period !== "string") return "unknown";
  if(key==="cornBaseline")return period==="1991-2020"?"current":"unknown";
  if(key==="cornProduction") {
    const year=new Date(now).getUTCFullYear();
    return period===String(year-1)?"current":period===String(year-2)&&new Date(now).getUTCMonth()===0?"awaiting":"overdue";
  }
  if(key==="cornProgress") {
    const d=Date.parse(period),date=new Date(now),month=date.getUTCMonth();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(period)||!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==period||d>now)return "unknown";
    if(now-d<=10*DAY)return "current";
    // National weekly reports pause in winter; old evidence is not current crop stage.
    if((month===11||month<3)&&period>=`${date.getUTCFullYear()-(month<3?1:0)}-11-01`)return "awaiting";
    return "overdue";
  }
  const date = new Date(now), current = monthAt(now), observed = period.slice(0, 7);
  if (!month(observed) || observed > current) return "unknown";
  if (["weather", "soil", "drought", "enso"].includes(key) &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(period) || !Number.isFinite(Date.parse(period)) ||
       new Date(period).toISOString().slice(0, 10) !== period || Date.parse(period) > now)) return "unknown";
  const age = (now - Date.parse(period.length === 7 ? `${period}-01` : period)) / DAY;
  if (["weather", "soil"].includes(key)) {
    // The collector deliberately requests through UTC today minus four days.
    if (age > spec.policies.weatherDays) return "overdue";
    if (key === "soil" && observed !== current) {
      const requestedEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - spec.policies.soilCollectionLagDays * DAY);
      return requestedEnd.toISOString().slice(0, 7) < current ? "awaiting" : "overdue";
    }
    return "current";
  }
  if (key === "drought") return age > spec.policies.droughtDays ? "overdue" : "current";
  if (!["fao","worldBank","usda","enso","eia","noaa"].includes(key)) return "unknown";
  const schedule = releaseSources.find(row => row.id === (key === "enso" ? "noaa" : key));
  const target = ["fao", "worldBank", "eia", "noaa"].includes(key) ? monthAt(now, -1) : current;
  if (["fao", "worldBank"].includes(key) && observed >= current) return "unknown";
  const knownDate = key === "enso" ? schedule?.confirmed?.[current] :
    date.getUTCFullYear() === 2026 && schedule?.dates2026 ?
      `${current}-${String(schedule.dates2026[date.getUTCMonth()]).padStart(2, "0")}` : null;
  if (knownDate) {
    if (observed >= target) return "current";
    if (observed < monthAt(Date.parse(`${target}-01`), -1)) return "overdue";
    return now < Date.parse(knownDate) + 3 * DAY ? "awaiting" : "overdue";
  }
  // No precise release commitment is known. A max-age guard is not a schedule.
  if (age > (key === "enso" ? spec.policies.ensoDays : spec.policies.monthlyMaxDays)) return "overdue";
  return observed >= target ? "current" : "unknown";
}

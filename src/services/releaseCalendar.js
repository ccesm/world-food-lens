import {releaseSources} from "../data/releaseSchedule.js";
import {monthOffset} from "./priceForecast.js";

export function buildReleaseCalendar(today = new Date().toISOString().slice(0,10), sources = releaseSources) {
  const currentMonth = today.slice(0,7);
  const endMonth = monthOffset(currentMonth,12);
  const [endYear,endMonthNumber] = endMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(endYear,endMonthNumber,0)).getUTCDate();
  const endDate = `${endMonth}-${String(Math.min(Number(today.slice(8)),lastDay)).padStart(2,"0")}`;
  const events = [];
  for(let i=0;i<=12;i++) {
    const month = monthOffset(currentMonth,i);
    for(const source of sources) {
      const day = month.startsWith("2026-") ? source.dates2026?.[Number(month.slice(5))-1] : null;
      const exact = day ? `${month}-${String(day).padStart(2,"0")}` : source.confirmed?.[month];
      let start = exact || `${month}-${String(source.window[0]).padStart(2,"0")}`;
      let end = exact || `${month}-${String(source.window[1]).padStart(2,"0")}`;
      if(end < today || start > endDate)continue;
      events.push({id:`${source.id}-${month}`, source, month, start, end,
        confirmed:!!exact, time:source.id==="usda" && exact?"12:00 America/New_York":null});
    }
  }
  return {today,endDate,events:events.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id))};
}

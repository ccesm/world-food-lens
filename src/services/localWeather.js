const DAY=86400000;
export function weatherSummary(record,calendar,selectedMonth,now=Date.now(),year=new Date(now).getUTCFullYear(),mode="month"){
  if(!Number.isInteger(year)||!Number.isInteger(selectedMonth)||selectedMonth<1||selectedMonth>12)return null;
  const all=record?.days;
  if(!Array.isArray(all)||!all.length)return null;
  const period=`${year}-${String(selectedMonth).padStart(2,"0")}`;
  const currentPeriod=new Date(now).toISOString().slice(0,7);
  const days=mode==="recent"?all.slice(-30):all.filter(d=>typeof d?.date==="string"&&d.date.startsWith(`${period}-`));
  if(!days.length||mode==="recent"&&days.length!==30)return null;
  const monthLength=new Date(Date.UTC(year,selectedMonth,0)).getUTCDate();
  if(mode!=="recent"&&(period>currentPeriod||days[0].date!==`${period}-01`||
    (period<currentPeriod&&days.length!==monthLength)))return null;
  for(let i=0;i<days.length;i++){
    const row=days[i];
    if(!row||typeof row!=="object")return null;
    const time=Date.parse(row.date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==row.date||
      (i&&time-Date.parse(days[i-1].date)!==DAY)||
      ![row.max,row.min,row.rain].every(Number.isFinite)||row.min>row.max||row.min< -100||row.max>70||row.rain<0||row.rain>2000)return null;
  }
  const end=days.at(-1).date,lag=(now-Date.parse(end))/DAY;
  if(lag<0)return null;
  const fetched=Date.parse(record.fetchedAt);
  const historical=mode!=="recent"&&period<currentPeriod;
  const stale=!Number.isFinite(fetched)||fetched>now+300000||now-fetched>3*DAY||(!historical&&lag>10)||record.status!=="ok";
  let run=0,dry=0;
  for(const row of days){run=row.rain<1?run+1:0;dry=Math.max(dry,run);}
  // Align daily weather with each day's template month, not a future selected stage.
  const sensitive=days.filter(row=>["F","G"].includes(calendar.months[+row.date.slice(5,7)-1]));
  const currentMonth=new Date(now).getUTCMonth()+1;
  return {start:days[0].date,end,stale,lag:Math.floor(lag),max:Math.max(...days.map(d=>d.max)),
    min:Math.min(...days.map(d=>d.min)),rain:days.reduce((n,d)=>n+d.rain,0),dry,
    heat:days.filter(d=>d.max>=35).length,cold:days.filter(d=>d.min<=0).length,
    sensitiveDays:sensitive.length,sensitiveHeat:sensitive.filter(d=>d.max>=35).length,
    historical,partial:mode!=="recent"&&days.length<monthLength,
    interpret:mode==="recent"?!stale&&selectedMonth===currentMonth&&year===new Date(now).getUTCFullYear():historical||!stale,days};
}

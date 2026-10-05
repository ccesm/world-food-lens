import {config,validDate} from "./cornData.js";
const finite=Number.isFinite,hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const source=url=>{try{return ["esmis.nal.usda.gov","power.larc.nasa.gov"].includes(new URL(url).hostname)&&new URL(url).protocol==="https:";}catch{return false;}};
/** Historical research is not a current alert feed; it is shipped in a lazy,
 * content-hashed Vite chunk, never merged into live data health or notifications. */
export function validCornHistory(a) {
  try {
    if(a?.schemaVersion!==1||a.protocol!=="corn-history/1"||a.methodologyVersion!==config.methodVersion||a.validationMode!=="retrospective"||
      !/^research-[a-f0-9]{64}$/.test(a.artifactId)||!hash(a.inputHash)||!hash(a.replay?.inputBytesSha256)||
      a.pointInTime?.eligibility!=="unavailable"||!a.pointInTime.reasons.length||!Array.isArray(a.seasons)||!a.seasons.length||
      new Set(a.seasons.map(s=>s.season)).size!==a.seasons.length)return false;
    return a.seasons.every(s=>Number.isInteger(s.season)&&s.validationMode==="retrospective"&&s.methodologyVersion===a.methodologyVersion&&
      ["eligible","partial","unavailable"].includes(s.eligibility)&&Array.isArray(s.timeline)&&s.stats.scheduledWeeks===s.timeline.length&&
      s.stats.completeWeeks===s.timeline.filter(w=>w.eligible).length&&s.outcome.latestFinal===null&&
      Object.values(s.inputVersions).every(v=>hash(v.contentHash)&&source(v.downloadUrl))&&
      s.timeline.every(w=>validDate(w.end)&&validDate(w.asOf)&&w.end.startsWith(String(s.season))&&w.asOf>w.end&&
        [w.heat,w.moisture,w.union].every(v=>v===null||finite(v)&&v>=0&&v<=w.coverage?.assessed+1e-9)&&
        w.regions.length===10&&w.regions.every((r,i)=>r.id===config.regions[i].id&&r.inputs.every(id=>s.inputVersions[id])&&
          (!r.eligible||r.weather&&[r.weather.maxAnomaly,r.weather.rainAnomaly,r.weather.rootAnomaly].every(finite))))&&
      s.supplyTimeline.every(r=>validDate(r.publishedDate)&&[r.yield,r.production,r.harvestedArea].every(finite)&&s.inputVersions[r.input])&&
      s.conditionTimeline.every(r=>validDate(r.weekEnding)&&validDate(r.publishedDate)&&s.inputVersions[r.input])&&
      [1,2,4].every(lag=>s.comparisons[lag].cases.length===s.comparisons[lag].pairs&&
        s.comparisons[lag].cases.every(c=>s.inputVersions[c.baselineInput]&&s.inputVersions[c.outcomeInput])));
  }catch{return false;}
}

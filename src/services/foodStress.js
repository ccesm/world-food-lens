// WFL experimental screening rules, not fitted crisis probabilities.
import {sourceState, validSourceData} from "./officialSources.js";

const finite = x => typeof x === "number" && Number.isFinite(x);
export const RISK_WEIGHTS = {crop:25, stocks:20, imports:15, energy:15, trade:10, prices:10, synchronization:5};
export const GRAINS = ["wheat", "maize", "rice"];

// Midrank empirical percentile against PRIOR observations only; ties are neutral.
export function percentile(value, history, minimum = 10) {
  if (!finite(value) || !Array.isArray(history) || history.length < minimum || !history.every(finite)) return null;
  return 100 * (history.filter(x => x < value).length + .5 * history.filter(x => x === value).length) / history.length;
}

export function inventorySummary(grain, scope = "world") {
  if (!Array.isArray(grain?.history) || !["world", "excludingChina"].includes(scope)) return null;
  const rows = grain.history.map(row => ({year:row.year, ...(scope === "world" ? row : row.excludingChina)}));
  if (rows.length < 11 || rows.some((r,i) => !/^\d{4}\/\d{4}$/.test(r.year) ||
      (i && +r.year.slice(0,4) !== +rows[i-1].year.slice(0,4)+1) ||
      !finite(r.ratio) || r.ratio < 0 || !finite(r.production) || r.production <= 0 ||
      !finite(r.consumption) || r.consumption <= 0 || !finite(r.endingStocks) || r.endingStocks < 0 ||
      Math.abs(r.ratio-r.endingStocks/r.consumption*100) > .001)) return null;
  const current = rows.at(-1), prior = rows.slice(0,-1);
  return {current, previous:rows.at(-2), percentile:percentile(current.ratio,prior.map(r=>r.ratio)),
    referenceStart:prior[0].year, referenceEnd:prior.at(-1).year, count:prior.length};
}

const monthNumber = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "")
  ? +month.slice(0,4)*12 + +month.slice(5,7)-1 : NaN;

export function priceSignal(rows, field) {
  if (!Array.isArray(rows) || rows.length < 37 || rows.some((row,i) =>
      !finite(row[field]) || row[field]<=0 || !Number.isFinite(monthNumber(row.month)) ||
      (i && monthNumber(row.month) !== monthNumber(rows[i-1].month)+1))) return null;
  const latest = rows.at(-1), reference = rows.slice(-121,-1);
  const yoy = (latest[field]/rows.at(-13)[field]-1)*100;
  return {value:latest[field], period:latest.month, yoy,
    // Price LEVEL percentile measures cost/price pressure, not acceleration.
    score:percentile(latest[field],reference.map(row=>row[field]),36),
    referenceStart:reference[0].month, referenceEnd:reference.at(-1).month, count:reference.length};
}

export function riskLevel(score) {
  if (!finite(score) || score<0 || score>100) return "unavailable";
  return score<=20?"low":score<=40?"moderate":score<=60?"elevated":score<=80?"high":"critical";
}

export function combineEvidence(factors) {
  const rows = Object.entries(RISK_WEIGHTS).map(([id,weight]) => {
    const score = factors[id];
    const valid = finite(score) && score >= 0 && score <= 100;
    return {id,weight,score:valid?score:null,contribution:valid?score*weight/100:null};
  });
  const coverage = rows.reduce((sum,r)=>sum+(r.score===null?0:r.weight),0);
  const known = rows.reduce((sum,r)=>sum+(r.contribution??0),0);
  // Do not renormalize missing factors into a falsely reassuring total.
  const score = coverage===100 ? known : null;
  return {rows,coverage,known,score,level:riskLevel(score),bounds:[known,known+100-coverage]};
}

export function buildFoodStress(bundle, now=Date.now()) {
  const sources=bundle?.sources??{};
  const usable = key => validSourceData(key,sources[key]?.data) && sourceState(sources[key],now)==="cached" &&
    Number.isFinite(Date.parse(sources[key].fetchedAt)) && Date.parse(sources[key].fetchedAt)<=now &&
    monthNumber(sources[key].data.releasePeriod ?? sources[key].source?.period)<=
      monthNumber(new Date(now).toISOString().slice(0,7));
  const inventories=Object.fromEntries(GRAINS.map(key=>[key,inventorySummary(sources.usda?.data?.grains?.[key])]));
  const costFields=["brent","urea","dap","potash"];
  const costs=Object.fromEntries(costFields.map(key=>[key,priceSignal(sources.worldBank?.data?.monthly,key)]));
  const prices=priceSignal(sources.fao?.data?.monthly,"fao");
  const stocksReady=usable("usda") && GRAINS.every(key=>inventories[key]) &&
    new Set(GRAINS.map(key=>inventories[key]?.current.year)).size===1;
  const energyReady=usable("worldBank") && costFields.every(key=>costs[key]);
  const factors={stocks:stocksReady?GRAINS.reduce((sum,key)=>sum+100-inventories[key].percentile,0)/3:null,
    energy:energyReady?costFields.reduce((sum,key)=>sum+costs[key].score,0)/4:null,
    prices:usable("fao")?prices?.score:null};
  return {...combineEvidence(factors),inventories,costs,prices};
}

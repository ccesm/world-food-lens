import {hasOfficialData} from "../services/officialSources.js";

// USDA is the source for both wheat cards and the historical comparison.
// Do not read the duplicate, legacy headline.wheatStockToUse values here.
export function getDashboardMetrics(snapshot) {
  const {faoFoodPriceIndex, brent, urea} = snapshot.headline;
  const {stockToUse, priorStockToUse, latestPeriod} = snapshot.usda;
  const startYear = Number(latestPeriod.split("/")[0]);
  const wheat = {
    value: stockToUse,
    deltaPp: Number((stockToUse - priorStockToUse).toFixed(1)),
    period: latestPeriod,
    unit: "%",
  };
  const wheatHistory = snapshot.usda.history || [
    {year: `${startYear - 1}/${startYear}`, ratio: priorStockToUse},
    {year: latestPeriod, ratio: stockToUse},
  ];
  return {faoFoodPriceIndex, brent, urea, wheat, wheatHistory};
}

// Never append recovered rows to verified official series. Partial refreshes
// replace independent sections, with provenance for each card/table/chart.
export function createDashboard(recovered, bundle) {
  const records = bundle?.sources || {};
  const source = key => hasOfficialData(key, records[key]) ? records[key] : null;
  const fao = source("fao"), wb = source("worldBank"), usda = source("usda"), eia = source("eia");
  const useEia = eia && (!wb || eia.data.headline.period >= wb.data.headline.brent.period);
  const brent = useEia ? eia : wb;
  const brentHeadline = useEia ? eia.data.headline : wb?.data.headline.brent;
  let monthly = recovered.monthly;
  let officialChart = false;
  if (fao && brent) {
    const brentByMonth = new Map(brent.data.monthly.map(row => [row.month,row.brent]));
    const joined = fao.data.monthly.filter(row => brentByMonth.has(row.month)).map(row =>
      ({month:row.month,fao:row.fao,brent:brentByMonth.get(row.month)}));
    if (joined.length >= 2) {
      const byMonth = new Map(joined.map(row => [row.month,row]));
      const toOrdinal = value => Number(value.slice(0,4))*12 + Number(value.slice(5,7))-1;
      monthly = [];
      for(let ordinal=toOrdinal(joined[0].month); ordinal<=toOrdinal(joined.at(-1).month); ordinal++) {
        const month = `${Math.floor(ordinal/12)}-${String(ordinal%12+1).padStart(2,"0")}`;
        monthly.push(byMonth.get(month) || {month,fao:null,brent:null});
      }
      officialChart = true;
    }
  }
  return {
    ...recovered,
    headline:{...recovered.headline,
      faoFoodPriceIndex:fao?.data.headline || recovered.headline.faoFoodPriceIndex,
      brent:brentHeadline || recovered.headline.brent,
      urea:wb?.data.headline.urea || recovered.headline.urea},
    monthly,
    fertilizers:wb?.data.fertilizers || recovered.fertilizers,
    agriculture:wb?.data.agriculture || recovered.agriculture,
    usda:usda?.data || recovered.usda,
    provenance:{fao,brent,urea:wb,worldBank:wb,usda,officialChart},
  };
}

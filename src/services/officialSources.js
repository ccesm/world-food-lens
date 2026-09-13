// Downloads run in scripts/refresh_data.py, never in a visitor's browser.
export const officialSources = {
  fao: {label:"FAO · Food Price Index", homepage:"https://www.fao.org/worldfoodsituation/foodpricesindex/"},
  worldBank: {label:"World Bank · Pink Sheet", homepage:"https://www.worldbank.org/en/research/commodity-markets"},
  eia: {label:"EIA · Brent", homepage:"https://www.eia.gov/dnav/pet/hist/RBRTEm.htm"},
  usda: {label:"USDA · PSD", homepage:"https://apps.fas.usda.gov/psdonline/"},
  noaa: {label:"NOAA CPC · RONI", homepage:"https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/"},
  fapda: {label:"FAO · FAPDA", homepage:"https://fapda.apps.fao.org/", editorial:true},
};

const finite = value => typeof value === "number" && Number.isFinite(value);
const period = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "");
const headline = value => value && finite(value.value) && value.value > 0 &&
  (value.momPct === null || finite(value.momPct)) && period(value.period) && typeof value.unit === "string";
const series = (rows, field) => Array.isArray(rows) && rows.length >= 2 &&
  rows.every((row, i) => period(row.month) && finite(row[field]) && row[field] > 0 &&
    (!i || row.month > rows[i-1].month));

const quantities = row => row && ["production","consumption","endingStocks","ratio"].every(key=>finite(row[key])) &&
  row.production>0 && row.consumption>0 && row.endingStocks>=0 && row.ratio>=0 &&
  Math.abs(row.ratio-row.endingStocks/row.consumption*100)<.001;
const grain = data => data && Array.isArray(data.history) && data.history.length>=2 &&
  data.latestPeriod===data.history.at(-1)?.year && data.stockToUse===data.history.at(-1)?.ratio &&
  data.priorStockToUse===data.history.at(-2)?.ratio && data.history.every((row,i)=>
    /^\d{4}\/\d{4}$/.test(row.year??"") && +row.year.slice(5)===+row.year.slice(0,4)+1 && quantities(row) &&
    (!i || +row.year.slice(0,4)===+data.history[i-1].year.slice(0,4)+1) &&
    (row.excludingChina==null || (quantities(row.excludingChina) &&
      ["production","consumption","endingStocks"].every(key=>row.excludingChina[key]<=row[key]))));

export function validSourceData(key, data) {
  if (!data || typeof data !== "object") return false;
  if (key==="usda" && data.grains!==undefined && (!["wheat","maize","rice"].every(key=>
      grain(data.grains?.[key]) && data.grains[key].latestPeriod===data.latestPeriod) ||
      JSON.stringify(data.history)!==JSON.stringify(data.grains.wheat.history))) return false;
  if (key === "fao") return headline(data.headline) && series(data.monthly,"fao");
  if (key === "eia") return headline(data.headline) && series(data.monthly,"brent");
  if (key === "worldBank") return headline(data.headline?.brent) && headline(data.headline?.urea) &&
    series(data.monthly,"brent") && [data.fertilizers,data.agriculture].every(rows =>
      Array.isArray(rows) && rows.length > 0 && rows.every(row =>
        finite(row.price) && row.price > 0 && (row.momPct === null || finite(row.momPct)) &&
        period(row.period) && typeof row.nameEn === "string" && typeof row.nameZh === "string"));
  if (key === "usda") return /^\d{4}\/\d{4}$/.test(data.latestPeriod ?? "") &&
    finite(data.stockToUse) && finite(data.priorStockToUse) && data.stockToUse >= 0 &&
    Array.isArray(data.history) && data.history.length >= 2 &&
    data.history.every(row => typeof row.year === "string" && finite(row.ratio) && row.ratio >= 0);
  if (key === "noaa") return finite(data.latest?.value) && Array.isArray(data.history) &&
    data.history.length >= 2 && data.history.every(row => (row.value === null || finite(row.value)) && typeof row.period === "string");
  return false;
}

export function validateOfficialBundle(bundle) {
  if (!bundle || bundle.schemaVersion !== 1 || !bundle.sources || Array.isArray(bundle.sources)) {
    throw new Error("Unsupported official cache format");
  }
  for (const [key,record] of Object.entries(bundle.sources)) {
    if (!officialSources[key] || !record || !["ok","error"].includes(record.status)) throw new Error("Invalid source record");
    if (record.data && (!validSourceData(key,record.data) ||
      !Number.isFinite(Date.parse(record.fetchedAt)) || !record.source?.url?.startsWith("https://"))) {
      throw new Error(`Invalid data for ${key}`);
    }
    if (record.status === "ok" && !record.data) throw new Error(`Missing data for ${key}`);
  }
  return bundle;
}

export function hasOfficialData(key, record) {
  return !!record?.fetchedAt && validSourceData(key,record.data);
}

export function sourceState(record, now = Date.now()) {
  if (!record?.data) return "unavailable";
  if (record.status === "error") return "retained";
  if (!record.fetchedAt || now - Date.parse(record.fetchedAt) > 72 * 60 * 60 * 1000) return "stale";
  const observation = record.data?.releasePeriod || record.data?.latest?.endMonth || record.source?.period;
  if (period(observation) && now - Date.parse(`${observation}-01T00:00:00Z`) > 100 * 86400000) return "old-observation";
  return "cached";
}

export function sourceStateLabel(record, lang) {
  const labels = {
    zh:{unavailable:"尚无已验证数据",retained:"更新失败 · 保留上次成功数据",stale:"官方缓存 · 超过 72 小时未成功检查","old-observation":"文件已检查 · 发布期较旧，请核对来源",cached:"官方数据 · 定时缓存"},
    en:{unavailable:"No verified data yet",retained:"Refresh failed · last good data retained",stale:"Official cache · not checked successfully for over 72h","old-observation":"File checked · older release; verify source",cached:"Official data · scheduled cache"},
  };
  return labels[lang][sourceState(record)];
}

export async function refreshOfficialData({fetchImpl = globalThis.fetch,
  baseUrl = import.meta.env?.BASE_URL || "./"} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(`${baseUrl}data/official-data.json?t=${Date.now()}`, {
      cache:"no-store", signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Cache HTTP ${response.status}`);
    return validateOfficialBundle(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

import {cropCalendars, CROP_NAMES} from "../data/cropCalendars.js";
import {weatherSummary} from "./localWeather.js";
import {droughtPointSummary, soilMoistureSummary} from "./droughtMonitor.js";
import {validSourceData, sourceState, officialSources} from "./officialSources.js";
import {validateEnsoBundle} from "./ensoOutlook.js";

const DAY = 86400000;
const text = (zh, en) => ({zh, en});
const finite = Number.isFinite;
const safe = fn => { try { return fn(); } catch { return null; } };
const monthIndex = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "")
  ? Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1 : NaN;
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  finite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validTimestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  finite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
const bilingual = value => value && [value.zh, value.en].every(v => typeof v === "string" && v.length > 0);
const httpsUrl = value => safe(() => new URL(value).protocol === "https:") === true;
const freshFetch = (record, now) => record?.status === "ok" && validTimestamp(record.fetchedAt) &&
  Date.parse(record.fetchedAt) <= now && now - Date.parse(record.fetchedAt) <= 3 * DAY;
const validCalendar = row => row && typeof row.id === "string" && bilingual(row.region) && CROP_NAMES[row.crop] &&
  Array.isArray(row.months) && row.months.length === 12 && row.months.every(stage => /^[PVWFGH-]$/.test(stage)) && httpsUrl(row.source);

export const ALERT_RULES_VERSION = "1";

function validAlert(alert) {
  return alert && typeof alert.id === "string" && alert.id.length > 0 &&
    ["crop", "market", "system"].includes(alert.category) && ["yellow", "red"].includes(alert.severity) &&
    ["title", "summary", "rule"].every(key => bilingual(alert[key])) && typeof alert.sourcePeriod === "string" && alert.sourcePeriod.length > 0 &&
    Array.isArray(alert.sources) && alert.sources.length > 0 && alert.sources.every(source =>
      typeof source.label === "string" && httpsUrl(source.url) && typeof source.period === "string") &&
    /^#[a-z0-9-]+$/.test(alert.target) && validTimestamp(alert.firstSeenAt) && validTimestamp(alert.lastEvaluatedAt) &&
    Date.parse(alert.firstSeenAt) <= Date.parse(alert.lastEvaluatedAt) &&
    ["active", "unverified"].includes(alert.state);
}

export function validateMonitorBundle(bundle) {
  if (bundle?.schemaVersion !== 1 || bundle.rulesVersion !== ALERT_RULES_VERSION || !validTimestamp(bundle.generatedAt) ||
    !Array.isArray(bundle.active) || !bundle.active.every(validAlert) || new Set(bundle.active.map(a => a.id)).size !== bundle.active.length ||
    bundle.active.some(alert => Date.parse(alert.lastEvaluatedAt) > Date.parse(bundle.generatedAt)) ||
    !Array.isArray(bundle.events) || bundle.events.length > 200 || !bundle.events.every(event =>
      typeof event?.id === "string" && typeof event.alertId === "string" && event.alertId === event.alert?.id &&
      ["new", "escalated", "resolved", "verification-lost", "reconfirmed"].includes(event.type) &&
      validTimestamp(event.at) && Date.parse(event.at) <= Date.parse(bundle.generatedAt) && validAlert(event.alert)) || new Set(bundle.events.map(e => e.id)).size !== bundle.events.length ||
    !Array.isArray(bundle.health) || !bundle.health.every(row => typeof row?.id === "string" && bilingual(row.label) &&
      ["ok", "unavailable"].includes(row.status) && bilingual(row.reason) &&
      (row.period == null || typeof row.period === "string" && row.period.length > 0) &&
      (row.fetchedAt == null || validTimestamp(row.fetchedAt))) || new Set(bundle.health.map(row => row.id)).size !== bundle.health.length ||
    !bilingual(bundle.coverage?.automatic) || !bilingual(bundle.coverage?.manual) ||
    !["not-configured", "configured", "sent", "failed"].includes(bundle.email?.status) ||
    (bundle.email.lastSentAt != null && !validTimestamp(bundle.email.lastSentAt)) ||
    (bundle.email.lastAttemptAt != null && !validTimestamp(bundle.email.lastAttemptAt))) return null;
  return bundle;
}

function nasaUrl(record, point, soil = false) {
  return safe(() => {
    const url = new URL(record.url), params = new Set(url.searchParams.get("parameters")?.split(","));
    return url.origin === "https://power.larc.nasa.gov" && url.pathname === "/api/temporal/daily/point" &&
      url.searchParams.get("time-standard") === "UTC" && url.searchParams.get("community") === "AG" &&
      url.searchParams.has("latitude") && url.searchParams.has("longitude") &&
      Number(url.searchParams.get("latitude")) === point.lat && Number(url.searchParams.get("longitude")) === point.lon &&
      (soil ? ["GWETROOT", "GWETTOP"] : ["T2M_MAX", "T2M_MIN", "PRECTOTCORR"]).every(key => params.has(key));
  }) === true;
}

function weatherEvidence(weather, point, calendar, now) {
  const record = weather?.schemaVersion === 1 ? weather.points?.[point.id] : null;
  if (!freshFetch(record, now) || !nasaUrl(record, point)) return null;
  const date = new Date(now);
  const summary = safe(() => weatherSummary(record, calendar, date.getUTCMonth() + 1, now, date.getUTCFullYear(), "recent"));
  return summary && !summary.stale && summary.interpret ? {record, summary} : null;
}

function soilEvidence(weather, point, now) {
  const record = weather?.schemaVersion === 1 ? weather.points?.[point.id] : null;
  if (!freshFetch(record, now) || !nasaUrl(record, point, true)) return null;
  const date = new Date(now);
  const summary = safe(() => soilMoistureSummary(record, date.getUTCMonth() + 1, date.getUTCFullYear(), now));
  if (!summary || summary.stale || summary.end > date.toISOString().slice(0, 10) ||
    !record.days.filter(row => row.date.startsWith(`${summary.start.slice(0, 7)}-`)).every(row => validDate(row.date))) return null;
  return {record, summary};
}

function droughtEvidence(drought, point, now) {
  // A date copied from a documentation example does not establish the latest release.
  if (drought?.periodVerified !== true || !freshFetch(drought, now)) return null;
  const summary = safe(() => droughtPointSummary(drought, point.id, now));
  const layer = summary?.layers.shortTerm;
  if (!summary?.interpret || !layer || !validDate(layer.period)) return null;
  const validLayer = safe(() => {
    const url = new URL(layer.url);
    return url.origin === "https://drought.emergency.copernicus.eu" && url.pathname === "/api/wms" &&
      url.searchParams.get("LAYERS") === "spaST" && url.searchParams.get("SELECTED_TIMESCALE") === "01" &&
      url.searchParams.get("TIME") === layer.period;
  });
  return validLayer ? layer : null;
}

function priceEvidence(official, key, field, now) {
  const record = official?.schemaVersion === 1 ? official.sources?.[key] : null;
  if (!freshFetch(record, now) || !safe(() => validSourceData(key, record.data)) || sourceState(record, now) !== "cached") return null;
  const expectedUnit = key === "fao" ? "2014–2016 = 100" : "USD / mt; Brent: USD / barrel";
  const expectedHost = key === "fao" ? "www.fao.org" : "www.worldbank.org";
  if (record.source?.unit !== expectedUnit || !httpsUrl(record.source?.url) ||
    safe(() => new URL(record.source.url).hostname) !== expectedHost) return null;
  const rows = record.data.monthly, [previous, current] = rows.slice(-2);
  if (!previous || !current || ![previous[field], current[field]].every(v => finite(v) && v > 0) ||
    monthIndex(current.month) !== monthIndex(previous.month) + 1 || record.source.period !== current.month ||
    monthIndex(current.month) >= monthIndex(new Date(now).toISOString().slice(0, 7))) return null;
  const expectedFieldUnit = field === "fao" ? "2014–2016 = 100" : field === "brent" ? "USD / barrel" : "USD / mt";
  const fertilizerNames = {dap:"DAP", tsp:"TSP", potash:"Potassium chloride"};
  const headline = key === "fao" ? record.data.headline : record.data.headline[field] ??
    record.data.fertilizers.find(row => row.nameEn === fertilizerNames[field]);
  const change = (current[field] / previous[field] - 1) * 100;
  if (!headline || headline.unit !== expectedFieldUnit || headline.period !== current.month ||
    (headline.value ?? headline.price) !== current[field] || !finite(headline.momPct) || Math.abs(headline.momPct - change) > .001) return null;
  return {record, period:current.month, change};
}

function hashEvent(value) {
  let hash = 14695981039346656037n;
  for (const character of value) hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0))) * 1099511628211n);
  return `evt-${hash.toString(16).padStart(16, "0")}`;
}

function reconcile(outcomes, previous, at) {
  const old = new Map((previous?.active ?? []).map(alert => [alert.id, alert]));
  const active = [], events = [...(previous?.events ?? [])];
  const event = (type, alert) => events.push({id:hashEvent(`${alert.id}|${type}|${at}|${alert.firstSeenAt}|${alert.severity}|${events.at(-1)?.id ?? "start"}`), alertId:alert.id, type, at, alert:{...alert}});
  for (const id of new Set([...old.keys(), ...outcomes.keys()])) {
    const prior = old.get(id), result = outcomes.get(id);
    if (!result || result.status === "unavailable") {
      if (prior) {
        const retained = {...prior, state:"unverified", lastEvaluatedAt:at};
        active.push(retained);
        if (prior.state !== "unverified") event("verification-lost", retained);
      }
    } else if (result.status === "clear") {
      if (prior) event("resolved", {...prior, state:"active", lastEvaluatedAt:at});
    } else {
      const alert = {...result.alert, firstSeenAt:prior?.firstSeenAt ?? at, lastEvaluatedAt:at, state:"active"};
      active.push(alert);
      if (!prior) event("new", alert);
      else if (prior.severity === "yellow" && alert.severity === "red") event("escalated", alert);
      else if (prior.state === "unverified") event("reconfirmed", alert);
    }
  }
  active.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1) || a.id.localeCompare(b.id));
  return {active, events:events.slice(-200)};
}

/** Deterministic evidence screens. None estimates yield loss or a crisis probability. */
export function evaluateAutomaticAlerts({weather, drought, official, enso, previous = null, points = [], calendars = cropCalendars, now = Date.now()} = {}) {
  if (!finite(now)) throw new Error("Invalid evaluation time");
  if (previous && (!validateMonitorBundle(previous) || Date.parse(previous.generatedAt) > now)) throw new Error("Invalid previous alert state; refusing to discard event history");
  const at = new Date(now).toISOString(), currentMonth = new Date(now).getUTCMonth();
  const outcomes = new Map(), weatherReady = new Set(), droughtReady = new Set(), soilReady = new Set();
  const currentPeriods = {weather:[], soil:[], drought:[]};
  let calendarCount = 0;
  const outcome = (id, ready, alert) => outcomes.set(id, !ready ? {status:"unavailable"} : alert ? {status:"active", alert} : {status:"clear"});
  for (const point of points) {
    if (!point || typeof point.id !== "string" || !finite(point.lat) || !finite(point.lon) || !Array.isArray(point.crops)) continue;
    const soil = soilEvidence(weather, point, now);
    if (soil) { soilReady.add(point.id); currentPeriods.soil.push(soil.summary.end); }
    const dry = droughtEvidence(drought, point, now);
    if (dry) { droughtReady.add(point.id); currentPeriods.drought.push(dry.period); }
    for (const cropId of point.crops) {
      const calendar = calendars.find(row => row.id === cropId);
      const heatId = `crop/heat/${point.id}/${cropId}`, dryId = `crop/drought/${point.id}/${cropId}`;
      if (!validCalendar(calendar)) { outcome(heatId, false); outcome(dryId, false); continue; }
      calendarCount++;
      const crop = CROP_NAMES[calendar.crop], observed = weatherEvidence(weather, point, calendar, now);
      if (observed) { weatherReady.add(point.id); currentPeriods.weather.push(observed.summary.end); }
      let heatAlert = null;
      if (observed) {
        const days = observed.summary.days.slice(-7);
        const hotDays = days.filter(row => row.max >= 35 && ["F", "G"].includes(calendar.months[Number(row.date.slice(5, 7)) - 1])).length;
        if (hotDays >= 3) {
          const period = `${days[0].date} – ${days.at(-1).date}`;
          heatAlert = {id:heatId, category:"crop", severity:hotDays >= 5 ? "red" : "yellow",
            title:text(`${calendar.region.zh} · ${crop.zh}高温暴露`, `${calendar.region.en} · ${crop.en} heat exposure`),
            summary:text(`${point.label}：最近 7 个已观测日中，${hotDays} 天最高温 ≥35°C 且日期处于日历估计的开花或灌浆期。代表点筛查，不代表全产区或已确认减产。`,
              `${point.label}: ${hotDays} of the latest 7 observed days reached ≥35°C during calendar-estimated flowering or grain fill. A representative-point screen; no region-wide exposure or yield loss is established.`),
            rule:text("WFL 筛查：7 个连续已观测日内，关键期 ≥35°C 达 3 天为黄、5 天为红；按每一天的月份匹配估计生育期。",
              "WFL screen: ≥3 qualifying days in 7 consecutive observed days is yellow; ≥5 is red. Each day's month is matched to the estimated crop stage."),
            sourcePeriod:period, sources:[{label:"NASA POWER · daily temperature (°C)", url:observed.record.url, period},
              {label:"USDA-informed seasonal calendar · WFL estimate", url:calendar.source, period:"Monthly seasonal template"}], target:"#crop-windows"};
        }
      }
      outcome(heatId, Boolean(observed), heatAlert);
      let dryAlert = null;
      if (dry && ["P", "V", "F", "G"].includes(calendar.months[currentMonth]) && ["severely-dry", "extremely-dry"].includes(dry.value)) {
        dryAlert = {id:dryId, category:"crop", severity:"yellow",
          title:text(`${calendar.region.zh} · ${crop.zh}干旱关注`, `${calendar.region.en} · ${crop.en} drought watch`),
          summary:text(`${point.label}：官方短期 SPI 图层分类为${dry.value === "extremely-dry" ? "极端" : "严重"}偏干，目前处于日历估计的活跃生长期。图层日期 ${dry.period}，仅代表该点。`,
            `${point.label}: the official short-term SPI map class is ${dry.value}, overlapping the current calendar-estimated growing season. Layer date: ${dry.period}; this represents the sampled point only.`),
          rule:text("WFL 黄灯筛查：日期被官方可用范围证实的 1 个月 SPI 严重 / 极端偏干 + 当前播种、营养生长、开花或灌浆期。不由 ENSO 推断；本版不自动发出干旱红灯。",
            "WFL yellow screen: 1-month SPI severe/extreme dryness with a date corroborated by official availability, plus current planting, vegetative, flowering or grain-fill stage. Not inferred from ENSO; no automatic red drought classification in this version."),
          sourcePeriod:dry.period, sources:[{label:"Copernicus CEMS · GDO SPI (1 month)", url:dry.url, period:dry.period},
            {label:"USDA-informed seasonal calendar · WFL estimate", url:calendar.source, period:"Monthly seasonal template"}], target:"#drought-monitor"};
      }
      outcome(dryId, Boolean(dry), dryAlert);
    }
  }

  const marketReady = new Map();
  const definitions = [
    ["fao", "fao", "FAO 食品价格指数", "FAO Food Price Index", 5, 10, "#s1"],
    ["worldBank", "brent", "布伦特原油", "Brent crude", 10, 20, "#s4"],
    ["worldBank", "urea", "尿素", "Urea", 10, 20, "#s4"],
    ["worldBank", "dap", "磷酸二铵 DAP", "DAP", 10, 20, "#s4"],
    ["worldBank", "tsp", "重过磷酸钙 TSP", "TSP", 10, 20, "#s4"],
    ["worldBank", "potash", "氯化钾", "Potassium chloride", 10, 20, "#s4"],
  ];
  for (const [key, field, zh, en, yellow, red, target] of definitions) {
    const id = `market/${key}/${field}`, evidence = priceEvidence(official, key, field, now);
    marketReady.set(field, evidence);
    let alert = null;
    if (evidence && evidence.change + 1e-9 >= yellow) {
      const percent = evidence.change.toFixed(1);
      alert = {id, category:"market", severity:evidence.change + 1e-9 >= red ? "red" : "yellow",
        title:text(`${zh}月度涨幅预警`, `${en} monthly price rise`),
        summary:text(`${evidence.period} 月度基准环比上涨 ${percent}%。这是价格 / 成本压力筛查，实际粮食供应影响需进一步核对。`,
          `The ${evidence.period} monthly benchmark increased ${percent}% from the preceding calendar month. This screens price/cost pressure; food-supply consequences need separate evidence.`),
        rule:text(`WFL 筛查：相邻完整月份涨幅 ≥${yellow}% 为黄、≥${red}% 为红；直接由经单位校验的数值重新计算。`,
          `WFL screen: ≥${yellow}% between adjacent complete months is yellow; ≥${red}% is red. Recalculated from values with validated units.`),
        sourcePeriod:evidence.period, sources:[{label:officialSources[key].label, url:evidence.record.source.url, period:evidence.period}], target};
    }
    outcome(id, Boolean(evidence), alert);
  }

  const total = points.length;
  const healthRow = (id, label, ready, reason, period, fetchedAt) => ({id, label, status:ready ? "ok" : "unavailable", reason,
    ...(period ? {period} : {}), ...(validTimestamp(fetchedAt) ? {fetchedAt} : {})});
  const range = values => values.length ? [...new Set(values)].sort().join(" / ") : undefined;
  const ensoValid = safe(() => validateEnsoBundle(enso, now));
  const ensoReady = Boolean(ensoValid && !ensoValid.stale && freshFetch(enso, now) && validDate(ensoValid.data.issuedAt) &&
    Date.parse(ensoValid.data.issuedAt) <= now);
  const health = [
    healthRow("weather", text("气温观测", "Temperature observations"), total > 0 && weatherReady.size === total,
      text(`${weatherReady.size}/${total} 个代表点通过连续性、来源和时效检查；最新观测最多允许滞后 10 天。`, `${weatherReady.size}/${total} representative points pass continuity, source and freshness checks; latest observations may lag by at most 10 days.`), range(currentPeriods.weather), weather?.generatedAt),
    healthRow("drought", text("官方干旱图层", "Official drought layer"), total > 0 && droughtReady.size === total,
      drought?.periodVerified !== true ? text("图层日期尚未被官方可用数据范围证实；暂停自动干旱判定。", "The layer date has not been corroborated by official data availability; automatic drought screening is paused.") :
        text(`${droughtReady.size}/${total} 个点有有效且及时的短期 SPI；缺失数据不会解除旧预警。`, `${droughtReady.size}/${total} points have usable, current short-term SPI; missing data does not resolve an existing alert.`), range(currentPeriods.drought), drought?.fetchedAt),
    healthRow("soil", text("土壤湿度背景", "Soil-moisture context"), total > 0 && soilReady.size === total,
      text(`${soilReady.size}/${total} 个点有有效当月数据及 1991–2020 同月基准；部分月份仅作背景，不触发红色预警。`, `${soilReady.size}/${total} points have usable current-month data and 1991–2020 same-month normals; partial months are context only and never trigger red alerts.`), range(currentPeriods.soil), weather?.generatedAt),
    healthRow("fao", text("FAO 月度食品价格", "FAO monthly food prices"), Boolean(marketReady.get("fao")),
      marketReady.get("fao") ? text("相邻月份、单位、数值及更新时间已校验。", "Adjacent months, units, values and freshness validated.") : text("月度数据缺失、过期或未通过单位 / 日期校验。", "Monthly data missing, stale, or failed unit/date validation."), marketReady.get("fao")?.period, official?.sources?.fao?.fetchedAt),
    healthRow("costs", text("世界银行能源与化肥", "World Bank energy and fertilizer"), ["brent", "urea", "dap", "tsp", "potash"].every(key => marketReady.get(key)),
      text(`${["brent", "urea", "dap", "tsp", "potash"].filter(key => marketReady.get(key)).length}/5 个成本序列可评估；使用完整月份环比。`, `${["brent", "urea", "dap", "tsp", "potash"].filter(key => marketReady.get(key)).length}/5 cost series can be evaluated, using complete-month changes.`), official?.sources?.worldBank?.source?.period, official?.sources?.worldBank?.fetchedAt),
    healthRow("enso", text("ENSO 展望背景", "ENSO outlook context"), ensoReady,
      text("仅检查背景资料更新；ENSO 强度和历史倾向不会直接触发作物预警。", "Context freshness only; ENSO strength and historical tendencies never directly trigger crop alerts."), ensoValid?.data?.issuedAt, enso?.fetchedAt),
    healthRow("calendar", text("作物季节模板", "Crop seasonal templates"), calendarCount > 0 && calendarCount === points.reduce((sum, point) => sum + (point?.crops?.length ?? 0), 0),
      text(`${calendarCount} 个作物窗口可匹配。模板是估计生育期，仍需人工维护；不是实测田间进度。`, `${calendarCount} crop windows can be matched. Templates estimate growth stages and require editorial maintenance; they are not measured crop progress.`)),
  ];
  const state = reconcile(outcomes, previous, at);
  const result = {schemaVersion:1, rulesVersion:ALERT_RULES_VERSION, generatedAt:at, ...state, health,
    coverage:{automatic:text("NASA POWER 代表点高温与生育期重叠、日期被官方可用范围证实的短期干旱图层、FAO 与世界银行完整月份价格 / 成本涨幅。每日重新检查；源数据按各自发布节奏更新。",
      "Representative-point NASA POWER heat/stage overlap, official short-term drought layers with availability-corroborated dates, and complete-month FAO/World Bank price and cost rises. Rechecked daily; source observations follow provider publication schedules."),
      manual:text("政策、战争、地区季节预报和产量影响仍需人工核实。ENSO 与土壤湿度作背景；未自动推断受灾面积、减产比例或全球危机概率。",
        "Policy, conflict, regional seasonal forecasts and yield consequences still require review. ENSO and soil moisture provide context; affected area, yield loss and global crisis probabilities are not automatically inferred.")},
    email:previous?.email ? {status:previous.email.status, ...(previous.email.lastSentAt ? {lastSentAt:previous.email.lastSentAt} : {})} : {status:"not-configured"}};
  if (!validateMonitorBundle(result)) throw new Error("Generated alert schema is invalid");
  return result;
}

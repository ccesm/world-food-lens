export const policyCountries = {
  india: {zh: "印度", en: "India"},
  indonesia: {zh: "印度尼西亚", en: "Indonesia"},
  philippines: {zh: "菲律宾", en: "Philippines"},
  "black-sea": {zh: "黑海 / 乌克兰与俄罗斯", en: "Black Sea / Ukraine and Russia"},
  "red-sea": {zh: "红海 / 苏伊士航道", en: "Red Sea / Suez route"},
};

export const policyTypes = {
  "export-restriction": {zh: "出口限制", en: "Export restriction"},
  "export-relief": {zh: "出口放宽", en: "Export relaxation"},
  "import-relief": {zh: "进口减税", en: "Import tariff relief"},
  "trade-facilitation": {zh: "贸易通道安排", en: "Trade facilitation"},
  "shipping-disruption": {zh: "冲突与航运事件", en: "Conflict / shipping event"},
};

export const policyCommodities = {
  rice: {zh: "大米", en: "Rice"},
  wheat: {zh: "小麦", en: "Wheat"},
  maize: {zh: "玉米", en: "Maize"},
  grains: {zh: "谷物（综合）", en: "Grains (general)"},
  "palm-oil": {zh: "棕榈油", en: "Palm oil"},
  "vegetable-oil": {zh: "植物油", en: "Vegetable oil"},
  fertilizer: {zh: "化肥", en: "Fertilizer"},
  energy: {zh: "能源", en: "Energy"},
};

function searchableText(event) {
  const labels = [policyCountries[event.country], policyTypes[event.type],
    ...event.commodities.map(commodity => policyCommodities[commodity])];
  return [event.id, event.eventDate, event.publishedAt, event.title.zh, event.title.en,
    event.summary.zh, event.summary.en, event.source.publisher, event.source.title,
    ...labels.flatMap(label => label ? [label.zh, label.en] : [])]
    .join(" ").normalize("NFKC").toLowerCase();
}

// The registry is editorial, not a live FAPDA response. Return a copy: never
// mutate the checked-in source order while sorting and filtering in the UI.
export function filterPolicyEvents(events, {query = "", country = "", type = "", commodity = ""} = {}) {
  const terms = String(query).normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return events.filter(event =>
    (!country || event.country === country) &&
    (!type || event.type === type) &&
    (!commodity || event.commodities.includes(commodity)) &&
    terms.every(term => searchableText(event).includes(term))
  ).sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.id.localeCompare(b.id));
}

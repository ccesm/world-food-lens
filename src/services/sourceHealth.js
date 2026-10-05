import {datasetHealth} from "./dataHealth.js";
export {publicationState} from "./freshness.js";
export const HEALTH_VALUES = {
  retrieval:["ok", "failed", "unknown"], validation:["passed", "failed", "unverified", "unknown"],
  freshness:["current", "awaiting", "overdue", "stale", "unknown"], eligibility:["eligible", "insufficient"],
};

// Optional fields keep published v1 feeds readable. New rows must supply all four.
export function validHealthDetails(row) {
  return Object.keys(HEALTH_VALUES).every(key => row[key] === undefined) ||
    Object.entries(HEALTH_VALUES).every(([key, values]) => values.includes(row[key]));
}

// Phase 0 wire projection retained for archived feeds and notification readers.
// All source interpretation is performed by Central Data Health.
export function sourceHealth(record, options = {}) {
  const {retrieval,validation,freshness,eligibility} = datasetHealth(record, options);
  return {retrieval,validation,freshness,eligibility};
}
export function healthState(row) {
  if (row?.retrieval === undefined) return row?.status === "ok" ? "current" : "unknown";
  if (row.retrieval === "failed") return "retrieval-failed";
  if (row.validation === "failed") return "validation-failed";
  if (row.retrieval !== "ok") return "unknown";
  if (row.validation === "unverified") return "unverified";
  if (["stale", "overdue", "awaiting"].includes(row.freshness)) return row.freshness;
  if (row.eligibility === "insufficient") return "insufficient";
  return row.freshness === "current" ? "current" : "unknown";
}

const LABELS = {
  current:["资料可用", "Current / usable"], awaiting:["正常等待发布", "Awaiting publication"],
  overdue:["观测更新滞后", "Observation overdue"], stale:["缓存待重新检查", "Cache check overdue"],
  "retrieval-failed":["本次获取失败", "Latest retrieval failed"],
  "validation-failed":["新资料未通过核验", "New data failed validation"],
  unverified:["资料日期待核实", "Observation date unverified"],
  insufficient:["来源正常 · 判定资料不足", "Source checked · insufficient evidence"],
  unknown:["状态待核实", "Status needs verification"],
};
export const healthLabel = (row, lang) => LABELS[healthState(row)][lang === "en" ? 1 : 0];
export const evidenceLabel = (row, lang) => row?.eligibility === "eligible" || row?.eligibility === undefined && row?.status === "ok"
  ? (lang === "en" ? "Usable for this screen / context" : "可用于本项筛查 / 背景")
  : (lang === "en" ? "Evidence insufficient; previous alerts are not cleared" : "判定资料不足；不会因此解除旧预警");

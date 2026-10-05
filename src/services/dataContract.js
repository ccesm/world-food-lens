import spec from "../data/dataContract.json" with {type:"json"};
export {spec};
export const timestamp = value => typeof value === "string" && +value.slice(0,4)>0 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value) ? value : null;

// Deliberately limited shared JSON Schema subset. Adding a keyword requires
// matching Python + JS support and parity fixtures, not silent schema drift.
export function validSchema(value, schema = spec.schema) {
  if (schema.enum && !schema.enum.includes(value)) return false;
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).includes(type)) return false;
  if (typeof value === "string" && (value.length < (schema.minLength ?? 0) ||
    schema.pattern && !new RegExp(schema.pattern).test(value) || schema.format === "date-time" && !timestamp(value))) return false;
  if (value && type === "object") {
    if (schema.required?.some(key => !(key in value))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !(key in schema.properties))) return false;
    return Object.entries(schema.properties ?? {}).every(([key, rule]) => !(key in value) || validSchema(value[key], rule));
  }
  return true;
}
export function validMetadata(m) {
  return validSchema(m) && !(m.attempt.retrieval === "failed" && [m.attempt.format,m.attempt.semantic].some(x=>x!=="unknown")) &&
    !(m.attempt.semantic === "passed" && (m.attempt.format !== "passed" || m.attempt.retrieval !== "ok")) &&
    !(m.accepted.semantic === "passed" && m.accepted.format !== "passed");
}
export function inferDataset(record) {
  if (typeof record?.metadata?.datasetId === "string") return record.metadata.datasetId.split("/")[0];
  const d = record?.data;
  if (record?.days) return "weather";
  if (record?.maps) return "drought";
  if (d?.forecasts) return "enso";
  if (d?.latestPeriod) return "usda";
  if (d?.latest?.endMonth) return "noaa";
  if (d?.headline?.urea) return "worldBank";
  if (Array.isArray(d?.monthly) && d.monthly.some(r=>r?.fao!=null)) return "fao";
  if (Array.isArray(d?.monthly) && d.monthly.some(r=>r?.brent!=null)) return "eia";
  return "unknown";
}
export function observationPeriod(record, key = inferDataset(record)) {
  if (["weather","soil"].includes(key)) return Array.isArray(record?.days)?record.days.at(-1)?.date??null:null;
  if (key === "drought") return record?.maps?.shortTerm?.period ?? null;
  if (key === "enso") return record?.data?.issuedAt ?? null;
  return record?.data?.latest?.endMonth ?? record?.source?.period ?? null;
}

/** Temporary bridge: absent metadata only. Invalid explicit metadata MUST NOT
 * silently fall back to legacy success. Remove after all published caches and
 * archived feeds have passed a retention/migration window. */
export function normalizeMetadata(record, key = inferDataset(record), {valid = true, verified = true, pointId} = {}) {
  if (record?.metadata !== undefined) {
    const m=record.metadata;
    if (!validMetadata(m) || m.accepted.fetchedAt!==timestamp(record.fetchedAt) || m.attempt.checkedAt!==timestamp(record.lastAttemptAt) ||
      m.observation.period!==observationPeriod(record,key) ||
      (key!=="unknown" && m.datasetId.split("/")[0] !== (key==="soil"?"weather":key)) ||
      pointId && m.datasetId!==`weather/${pointId}` ||
      (record.status==="error" && m.attempt.semantic==="passed") ||
      (record.status==="ok" && (m.attempt.retrieval!=="ok" || m.attempt.semantic!=="passed")) ||
      key==="usda" && (m.observation.vintage!==record.data?.releasePeriod || m.observation.marketYear!==record.data?.latestPeriod)) return null;
    return m;
  }
  const hasData = !!(record?.data || record?.days?.length || record?.maps);
  const failed = record?.status === "error", kind = record?.failureKind ??
    (/^HTTPError: HTTP Error [45]\d\d\b/.test(record?.error ?? "") ? "retrieval" : "unknown");
  const success = record?.status === "ok", period = observationPeriod(record, key);
  const normalized = {contractVersion:1, datasetId:(key==="soil"?"weather":key) + (pointId ? `/${pointId}` : ""), provider:spec.providers[key] ?? key,
    sourceUrl:record?.source?.url ?? record?.url ?? null, downloadUrl:record?.source?.downloadUrl ?? record?.url ?? null,
    observation:{period,marketYear:key==="usda"?record?.data?.latestPeriod??null:null,
      vintage:key==="usda"?record?.data?.releasePeriod??null:null,publishedAt:timestamp(record?.source?.publishedAt)},
    attempt:{checkedAt:timestamp(record?.lastAttemptAt),retrieval:success || failed&&kind==="validation" ? "ok" : failed&&kind==="retrieval" ? "failed" : "unknown",
      format:success&&valid?"passed":"unknown",semantic:success?(valid?"passed":"failed"):failed&&kind==="validation"?"failed":"unknown",
      reason:success?null:failed&&kind==="retrieval"?"retrieval_failed":failed&&kind==="validation"?"semantic_validation_failed":"unknown"},
    accepted:{fetchedAt:timestamp(record?.fetchedAt),format:hasData&&valid?"passed":"unknown",semantic:hasData?(valid?"passed":"failed"):"unknown",
      period:!verified || key==="drought"&&record?.periodVerified!==true ? "unverified":period?"verified":"unknown"},
    cache:!hasData?"unavailable":failed?(kind==="validation"?"retained-validation":"retained-retrieval"):"legacy",
    version:{contentHash:null,observationId:record?.data?.observationId??null,revisionId:record?.data?.revisionId??null},
    extensions:key==="usda"?{coverage:{state:"unknown"}}:key==="enso"?{strengthExtraction:record?.data?.strengthEvidence?.status??"not-reliably-extracted"}:{}};
  return validMetadata(normalized)?normalized:null;
}

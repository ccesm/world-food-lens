import {spec, normalizeMetadata, inferDataset, validMetadata, timestamp} from "./dataContract.js";
import {publicationState} from "./freshness.js";
export {publicationState};
const DAY = 86400000;
export const reasonText = (code, lang="zh") => spec.reasons[code]?.[lang] ?? spec.reasons.unknown[lang];

export function freshCheck(record, now = Date.now()) {
  const m = normalizeMetadata(record);
  const checked = Date.parse(m?.accepted.fetchedAt);
  return m?.attempt.retrieval === "ok" && m.attempt.semantic === "passed" &&
    m.accepted.format === "passed" && m.accepted.semantic === "passed" &&
    Number.isFinite(checked) && checked <= now && now - checked <= spec.policies.checkDays * DAY;
}

/** Dataset health is not rule eligibility. Evidence is an explicit additional
 * requirement supplied by the owning rule; a healthy source may lack a window. */
export function datasetHealth(record, {key = inferDataset(record), valid = true, verified = true,
  eligible = false, publication, now = Date.now(), pointId, ruleId = "context", release = null} = {}) {
  const metadata = normalizeMetadata(record, key, {valid, verified, pointId});
  if (!metadata) return {metadata:null,retrieval:"unknown",validation:"failed",freshness:"unknown",eligibility:"insufficient",
    displayUsable:false,analysisUsable:false,reasons:["invalid_format"],evidence:{ruleId,eligible:false,reasons:["invalid_format"]},release};
  const m = metadata, reasons = [];
  const period = ["cornProduction","cornProgress"].includes(key)?m.observation.period:m.observation.vintage ?? m.observation.period;
  const fetched = Date.parse(m.accepted.fetchedAt);
  const freshness = !Number.isFinite(fetched)||fetched>now ? "unknown" : key!=="cornBaseline"&&now-fetched>spec.policies.checkDays*DAY ? "stale" :
    publication ?? publicationState(key, period, now);
  const verifiedPeriod = verified && m.accepted.period === "verified";
  const retrieval = m.attempt.retrieval;
  const validation = !record ? "unknown" : !valid || m.attempt.semantic === "failed" || m.attempt.format === "failed" ? "failed" :
    m.attempt.semantic === "unknown" ? "unknown" : !verified || m.accepted.period === "unverified" ? "unverified" : "passed";
  const displayUsable = valid && m.accepted.semantic === "passed" && m.accepted.format === "passed";
  const coverage = key === "usda" && !["baseline-established","compared"].includes(m.extensions.coverage?.state);
  // Legacy coverage is disclosed. Once the coverage-producing ingestion runs,
  // absence of metadata is not upgraded into verified analytical coverage.
  const analysisUsable = displayUsable && retrieval === "ok" && validation === "passed" && verifiedPeriod &&
    ["current","awaiting"].includes(freshness) && !(record?.metadata && coverage);
  if (m.attempt.reason) reasons.push(m.attempt.reason);
  if (record && !valid && !reasons.includes("semantic_validation_failed")) reasons.push("semantic_validation_failed");
  if (!verifiedPeriod) reasons.push("period_unverified");
  if (freshness === "awaiting") reasons.push("awaiting_publication");
  if (["overdue","stale"].includes(freshness)) reasons.push("stale");
  if (freshness === "unknown") reasons.push("unknown");
  if (m.cache.startsWith("retained")) reasons.push("cached_after_failure");
  if (coverage) reasons.push("coverage_incomplete");
  const usable = analysisUsable && eligible;
  return {metadata:m,retrieval,validation,freshness,eligibility:usable?"eligible":"insufficient",displayUsable,analysisUsable,
    reasons:[...new Set(reasons)],evidence:{ruleId,eligible:usable,reasons:usable?[]:[...new Set([...reasons,"insufficient_evidence"])]},release};
}

export function derivedProvenance(method, records, {now=Date.now(), eligible=false, release=null,inputIds=[]}={}) {
  return {methodVersion:method,calculatedAt:new Date(now).toISOString(),release,
    inputs:records.map((record,i)=>{const m=normalizeMetadata(record);return {
      datasetId:inputIds[i]??m?.datasetId??"unknown",vintage:m?.observation.vintage??null,observationId:m?.version.observationId??null,
      contentHash:m?.version.contentHash??null,revisionId:m?.version.revisionId??null};}),
    eligibility:eligible?"eligible":"insufficient",reasons:eligible?[]:["insufficient_evidence"]};
}

export function validHealthSnapshot(snapshot,release=null,at=snapshot?.assessedAt) {
  const reasons=values=>Array.isArray(values)&&values.every(v=>Object.hasOwn(spec.reasons,v));
  return snapshot?.schemaVersion===1 && !!timestamp(snapshot.assessedAt) && snapshot.assessedAt===at && snapshot.release===release &&
    Array.isArray(snapshot.datasets) && new Set(snapshot.datasets.map(r=>r?.id)).size===snapshot.datasets.length &&
    snapshot.datasets.every(row=>row&&typeof row.id==="string"&&row.id.length>0&&row.release===release&&
      (row.metadata===null||validMetadata(row.metadata))&&["ok","failed","unknown"].includes(row.retrieval)&&
      ["passed","failed","unknown","unverified"].includes(row.validation)&&["current","awaiting","overdue","stale","unknown"].includes(row.freshness)&&
      ["eligible","insufficient"].includes(row.eligibility)&&typeof row.displayUsable==="boolean"&&typeof row.analysisUsable==="boolean"&&
      reasons(row.reasons)&&typeof row.evidence?.ruleId==="string"&&typeof row.evidence.eligible==="boolean"&&reasons(row.evidence.reasons)&&
      row.evidence.eligible===(row.eligibility==="eligible")&&(!row.evidence.eligible||row.analysisUsable)&&
      (!row.analysisUsable||row.metadata!==null&&row.displayUsable&&row.retrieval==="ok"&&row.validation==="passed"&&["current","awaiting"].includes(row.freshness)));
}

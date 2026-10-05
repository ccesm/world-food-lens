// Wire validation and language rendering only. Evaluation lives on the build
// side; the browser neither recalculates signals nor chooses source versions.
import {validCornArtifact} from "./cornExposure.js";
import {validAlignment} from "./cornAlignment.js";
const hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const release=v=>typeof v==="string"&&/^release-[a-f0-9]{64}$/.test(v);
const object=v=>v&&typeof v==="object"&&!Array.isArray(v);
const timestamp=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&
  Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const strings=v=>Array.isArray(v)&&v.every(s=>typeof s==="string");
const nullableNumber=v=>v===null||Number.isFinite(v);
const version=v=>object(v)&&typeof v.datasetId==="string"&&typeof v.period==="string"&&hash(v.projectionHash)&&
  (v.contentHash===null||hash(v.contentHash))&&(v.vintage===null||typeof v.vintage==="string")&&
  (v.revisionId===null||hash(v.revisionId));
const observation=v=>object(v)&&["id","commodity","geography","period"].every(k=>typeof v[k]==="string");
const health=v=>object(v)&&["ok","failed","unknown"].includes(v.retrieval)&&
  ["passed","failed","unknown","unverified"].includes(v.validation)&&["current","awaiting","overdue","stale","unknown"].includes(v.freshness)&&
  typeof v.analysisUsable==="boolean"&&strings(v.reasons)&&["retained","accepted"].includes(v.cache);
const unavailable=v=>Array.isArray(v)&&v.every(r=>object(r)&&typeof r.datasetId==="string"&&strings(r.reasons));
const checkpoint=(c,key)=>object(c)&&c.id===key&&version(c.version)&&c.version.datasetId===key&&
  c.period===c.version.period&&c.vintage===c.version.vintage&&[true,false,null].includes(c.coverageVerified)&&object(c.rows)&&object(c.structures)&&
  Object.keys(c.rows).length>0&&Object.keys(c.rows).length===Object.keys(c.structures).length&&
  Object.entries(c.rows).every(([id,r])=>object(r)&&["commodity","geography","period"].every(k=>typeof r[k]==="string")&&
    id===[r.commodity,r.geography,r.period].join("|")&&object(r.values)&&object(c.structures[id]));
const types=["baseline","new-observation","new-publication-vintage","revision","structural-change","health-only"];
const validChange=(c,id)=>object(c)&&typeof c.id==="string"&&/^change-[a-f0-9]{64}$/.test(c.id)&&c.releaseId===id&&
  typeof c.datasetId==="string"&&types.includes(c.type)&&Object.hasOwn(c,"previous")&&Object.hasOwn(c,"current")&&
  (c.type==="health-only"?health(c.previous)&&health(c.current):version(c.currentVersion)&&c.currentVersion.datasetId===c.datasetId&&
    (c.previousVersion===null||version(c.previousVersion)&&c.previousVersion.datasetId===c.datasetId)&&
    (c.observation===null||observation(c.observation))&&(c.field===null||typeof c.field==="string")&&
    typeof c.method==="string"&&(c.unit===null||typeof c.unit==="string")&&
    typeof c.eligible==="boolean"&&strings(c.reasons)&&[null,"up","down","unchanged"].includes(c.direction)&&
    [c.absoluteDelta,c.percentDelta].every(nullableNumber)&&
    (c.type!=="structural-change"||!c.eligible&&c.absoluteDelta===null&&c.percentDelta===null));
const validSignal=(s,id,at)=>object(s)&&typeof s.id==="string"&&typeof s.ruleId==="string"&&s.ruleVersion==="1"&&s.releaseId===id&&
  s.evaluatedAt===at&&typeof s.method==="string"&&typeof s.notification==="boolean"&&
  ["observed","inactive","active","escalated","resolved","unverified"].includes(s.state)&&
  [null,"yellow","red"].includes(s.severity)&&typeof s.name?.zh==="string"&&typeof s.name?.en==="string"&&
  typeof s.eligible==="boolean"&&strings(s.reasons)&&Array.isArray(s.inputs)&&s.inputs.every(version)&&
  (s.observation===undefined||observation(s.observation))&&
  (s.evidenceType==="weather_exposure"?
    s.notification===false&&s.severity===null&&object(s.calculation)&&Number.isFinite(s.calculation.share)&&s.calculation.share>0&&
      s.calculation.share<=s.calculation.assessedShare&&s.calculation.assessedShare<=1:
    s.calculation===null||object(s.calculation)&&Number.isFinite(s.calculation.previous)&&Number.isFinite(s.calculation.current)&&nullableNumber(s.calculation.percentDelta))&&
  (!s.eligible||object(s.calculation))&&
  (!s.eligible||s.inputs.length>0)&&["heuristic","factual"].includes(s.threshold?.kind)&&s.threshold.validated===false&&
  (!s.eligible||s.state!=="unverified")&&(!s.severity||s.threshold.kind==="heuristic");

export function validPhase2(a,id,at) {
  return object(a)&&a.schemaVersion===1&&release(id)&&a.releaseId===id&&a.evaluatedAt===at&&timestamp(at)&&hash(a.integrity)&&
    timestamp(a.startedAt)&&a.startedAt<=at&&(a.prunedThrough===null||timestamp(a.prunedThrough)&&a.prunedThrough<=at)&&
    (a.cornPilot===undefined||validCornArtifact(a.cornPilot,id,at))&&
    (a.cornAlignment===undefined||validAlignment(a.cornAlignment,id,at))&&
    object(a.checkpoints)&&Object.entries(a.checkpoints).every(([key,c])=>["usda","fao","worldBank","enso","cornProduction","cornProgress"].includes(key)&&checkpoint(c,key))&&
    object(a.health)&&Object.values(a.health).every(health)&&a.changeSet?.releaseId===id&&a.changeSet.evaluatedAt===at&&Array.isArray(a.changeSet.datasets)&&
    a.changeSet.datasets.every(d=>object(d)&&typeof d.datasetId==="string"&&
      ["retained","baseline","changed","outside-tracked-scope","no-change"].includes(d.status)&&(d.reason===null||typeof d.reason==="string")&&
      (d.version===null||version(d.version)))&&
    unavailable(a.changeSet.unavailable)&&Array.isArray(a.changeSet.changes)&&a.changeSet.changes.every(c=>validChange(c,id))&&
    new Set(a.changeSet.changes.map(c=>c.id)).size===a.changeSet.changes.length&&
    Array.isArray(a.signals)&&a.signals.every(s=>validSignal(s,id,at))&&new Set(a.signals.map(s=>s.id)).size===a.signals.length&&
    Array.isArray(a.journal)&&a.journal.length>0&&a.journal.length<=128&&a.journal.at(-1)?.releaseId===id&&
    a.journal.every((e,i)=>object(e)&&release(e.releaseId)&&timestamp(e.evaluatedAt)&&e.evaluatedAt<=at&&
      (!i||e.evaluatedAt>=a.journal[i-1].evaluatedAt)&&Array.isArray(e.changes)&&e.changes.every(c=>validChange(c,e.releaseId))&&
      Array.isArray(e.signals)&&e.signals.every(s=>validSignal(s,e.releaseId,e.evaluatedAt))&&unavailable(e.unavailable))&&
    new Set(a.journal.map(e=>e.releaseId)).size===a.journal.length&&a.weekly?.end===at&&timestamp(a.weekly.start)&&typeof a.weekly.complete==="boolean"&&
    ["releases","newObservations","officialRevisions","publications","structuralChanges","signals","healthChanges","unavailableEvidence"].every(k=>Array.isArray(a.weekly[k]));
}

export const CHANGE_LABELS={
  baseline:{zh:"建立基线（不是新增观测）",en:"Baseline established (not a new observation)"},
  "new-observation":{zh:"新增观测",en:"New observation"},
  "new-publication-vintage":{zh:"新出版版本",en:"New publication vintage"},
  revision:{zh:"已发布数值修订",en:"Published value revision"},
  "structural-change":{zh:"结构变化 · 不作直接比较",en:"Structural change · not directly comparable"},
  "health-only":{zh:"数据运行变化",en:"Source health change"},
};
export const METRIC_LABELS={production:{zh:"产量",en:"Production"},consumption:{zh:"消费",en:"Consumption"},
  endingStocks:{zh:"期末库存",en:"Ending stocks"},ratio:{zh:"库存消费比",en:"Stock/use ratio"},
  vintage:{zh:"出版版本",en:"Publication vintage"},value:{zh:"基准数值",en:"Benchmark value"},
  elNino:{zh:"厄尔尼诺概率",en:"El Niño probability"},laNina:{zh:"拉尼娜概率",en:"La Niña probability"},
  neutral:{zh:"中性概率",en:"Neutral probability"},phase:{zh:"ENSO 阶段",en:"ENSO phase"},
  strengthEvidence:{zh:"强度原始证据",en:"Original strength evidence"},roniPercentiles:{zh:"RONI 分位数",en:"RONI percentiles"},
  structure:{zh:"覆盖 / 单位",en:"Coverage / units"},observation:{zh:"观测范围",en:"Observation scope"},
  spatialStageCoverage:{zh:"空间—生育期覆盖 / 可用性",en:"Spatial-stage coverage / eligibility"}};
export function dimensionLabel(value,lang="zh") {
  const names={wheat:{zh:"小麦",en:"Wheat"},maize:{zh:"玉米",en:"Maize"},rice:{zh:"大米",en:"Rice"},
    world:{zh:"全球",en:"World"},"world-ex-China":{zh:"全球（不含中国）",en:"World excluding China"},
    benchmark:{zh:"基准",en:"Benchmark"},pacific:{zh:"太平洋",en:"Pacific"},advisory:{zh:"公告",en:"Advisory"}};
  return names[value]?.[lang]??value;
}
export function changeText(change,lang="zh") {
  const o=change.observation,field=METRIC_LABELS[change.field]?.[lang]??change.field??"";
  const label=v=>dimensionLabel(v,lang);
  const numeric=Number.isFinite(change.previous)&&Number.isFinite(change.current);
  const number=v=>v.toLocaleString(lang==="zh"?"zh-CN":"en-GB",{maximumFractionDigits:3});
  return `${change.datasetId}${o?` · ${label(o.commodity)} · ${label(o.geography)} · ${o.period}`:""} · ${field} · ${CHANGE_LABELS[change.type][lang]}`+
    (numeric?` · ${number(change.previous)} → ${number(change.current)}`:Number.isFinite(change.current)?` · ${number(change.current)}`:"");
}

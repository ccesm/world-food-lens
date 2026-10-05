import React from "react";
import {changeText,dimensionLabel} from "../services/changeSet.js";
import {reasonText} from "../services/dataHealth.js";

const COPY={
  zh:{title:"最近资料变化",missing:"本发布尚未建立修订记录。首次运行将建立基线，不会把全部历史数据当作新增。",
    archive:"历史发布记录，不代表当前状态。",intro:"数值变化 ≠ 市场风险 ≠ 邮件预警。这里仅呈现可追溯的官方资料差异。",
    facts:"本发布 · 数据事实",signals:"确定性信号",health:"数据运行与证据缺口（不是市场信号）",none:"没有记录到数值或结构变化。",
    noSignals:"本次没有新的修订事实或活跃价格筛查信号。",week:"过去 7 天",partial:"记录窗口不完整（刚建立或已裁剪）",
    full:"记录覆盖完整窗口",observations:"新增数值",revisions:"修订数值",healthCount:"运行变化",factual:"事实记录 · 无警戒等级",
    heuristic:"本站启发式筛查 · 未经统计校准",unverified:"证据不足 · 不作当前判断",coverage:"范围：USDA 全球历史及近两个市场年度地区数据；FAO / 世界银行最近 24 个月；ENSO 官方展望。天气与土壤暂只记录运行状态，不作地区产量推断。",
    limited:"下方仅展示前 6 条；完整变更及输入版本保存在本发布资料文件。",version:"本发布",more:"更多数据事实",delta:"变化",percent:"相对变化",vintage:"出版版本"},
  en:{title:"Latest data changes",missing:"This release has no revision checkpoint yet. The first run establishes a baseline, not new historical observations.",
    archive:"Historical release record, not current conditions.",intro:"Data changes ≠ market risk ≠ email alerts. These are traceable differences in official evidence.",
    facts:"This release · data facts",signals:"Deterministic signals",health:"Source operations & evidence gaps (not market signals)",none:"No value or structural changes recorded.",
    noSignals:"No new revision facts or active price screens in this evaluation.",week:"Past 7 days",partial:"Incomplete window (initialization or pruning)",
    full:"Full window retained",observations:"New values",revisions:"Revised values",healthCount:"Health changes",factual:"Factual record · no severity",
    heuristic:"WFL heuristic screen · not statistically calibrated",unverified:"Insufficient evidence · no current conclusion",coverage:"Scope: USDA global history and two recent marketing years of contributor detail; latest 24 months of FAO / World Bank; official ENSO outlook. Weather and soil are health-only here, without regional yield inference.",
    limited:"Only the first 6 items are shown below; full changes and input versions are in this release's data file.",version:"Release",more:"More data facts",delta:"Delta",percent:"Relative change",vintage:"Publication vintage"},
};
const number=(v,lang)=>Number.isFinite(v)?v.toLocaleString(lang==="zh"?"zh-CN":"en-GB",{maximumFractionDigits:3}):"—";

export default function LatestChanges({analysis,lang="zh",archive=false}) {
  const t=COPY[lang];
  if(!analysis)return <details className="monitor-detail"><summary>{t.title}</summary><p>{t.missing}</p></details>;
  const rank=c=>c.type==="new-publication-vintage"?0:c.observation?.geography==="world"?1:2;
  const facts=analysis.changeSet.changes.filter(c=>c.type!=="health-only").sort((a,b)=>rank(a)-rank(b)||
    (b.observation?.period??"").localeCompare(a.observation?.period??""));
  const signals=analysis.signals.filter(s=>["observed","active","escalated"].includes(s.state)&&s.eligible);
  const health=analysis.changeSet.changes.filter(c=>c.type==="health-only");
  const fact=c=><li key={c.id}><p>{changeText(c,lang)}</p>{c.previousVersion&&<small>{t.vintage}: {c.previousVersion.vintage??c.previousVersion.period} → {c.currentVersion.vintage??c.currentVersion.period}</small>}
    {Number.isFinite(c.absoluteDelta)&&<small>{t.delta}: {number(c.absoluteDelta,lang)} ({c.unit??"—"}) · {t.percent}: {number(c.percentDelta,lang)}{c.percentDelta===null?"":"%"}</small>}
    {!c.eligible&&c.type!=="baseline"&&<small>{t.unverified}</small>}</li>;
  return <details className="monitor-detail"><summary>{t.title}</summary>
    {archive&&<p className="monitor-notice">{t.archive}</p>}<p>{t.intro}</p>
    <p>{t.week}: {t.observations} {analysis.weekly.newObservations.length} · {t.revisions} {analysis.weekly.officialRevisions.length} · {t.healthCount} {analysis.weekly.healthChanges.length}. {analysis.weekly.complete?t.full:t.partial}</p>
    <h3>{t.facts}</h3>{facts.length?<><ul>{facts.slice(0,6).map(fact)}</ul>{facts.length>6&&<p>{t.limited}</p>}</>:<p>{t.none}</p>}
    <h3>{t.signals}</h3>{signals.length?<ul>{signals.slice(0,6).map(s=><li key={s.id}><strong>{s.name[lang]}</strong>
      {s.observation&&<span> · {dimensionLabel(s.observation.commodity,lang)} · {s.observation.period}</span>}
      <p>{s.threshold.kind==="factual"?t.factual:t.heuristic} · {number(s.calculation?.percentDelta,lang)}{Number.isFinite(s.calculation?.percentDelta)?"%":""}</p></li>)}</ul>:<p>{t.noSignals}</p>}
    <details><summary>{t.health} · {health.length} / {analysis.changeSet.unavailable.length}</summary>
      <ul>{health.slice(0,6).map(c=><li key={c.id}>{c.datasetId}: {c.current.reasons.map(r=>reasonText(r,lang)).join(" · ")|| (lang==="zh"?"状态已变化":"State changed")}</li>)}</ul>
      <ul>{analysis.changeSet.unavailable.slice(0,6).map(u=><li key={u.datasetId}>{u.datasetId}: {u.reasons.map(r=>reasonText(r,lang)).join(" · ")||t.unverified}</li>)}</ul>
    </details><p className="monitor-footnote">{t.coverage}</p><small style={{overflowWrap:"anywhere"}}>{t.version}: {analysis.releaseId}</small>
  </details>;
}

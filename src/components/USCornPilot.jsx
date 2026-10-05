import React,{useEffect,useState} from "react";
import {loadAlertFeed} from "../services/alertFeed.js";
import {reasonText} from "../services/dataHealth.js";
import {config} from "../services/cornExposure.js";

const LABELS={
  zh:{title:"美国玉米 · 玉米带试点",intro:"产量分布 → 生育期 → 天气潜在暴露 ｜ 官方作物状况 ｜ USDA 供需修订。三类证据并列，不证明因果。",
    missing:"本发布尚无可用的试点资料。等待官方报告、代表点天气及 1991–2020 基线完成核验；不显示零暴露。",
    archive:"历史发布，仅供查看，不代表当前情况。",period:"统一天气窗口（UTC）",weight:"权重年度 / 报告日期",coverage:"十州占美国总产量",
    assessed:"可计算代表点对应的产量份额",unknown:"试点内资料不足份额",outside:"未覆盖州份额",heat:"高温筛查命中点对应份额",moisture:"水分不足筛查命中点对应份额",
    limit:"以上比例是州级产量权重与单个代表网格的关联，不是全州天气覆盖率、受灾面积、受损产量或预期减产。缺失地区不重新归一。",
    where:"地区 / 全国产量份额",when:"生育期证据",weather:"代表点天气 / 异常",condition:"官方作物状况",estimated:"日历估计",official:"官方累计进度",majority:"超过半数已达到的里程碑",
    rain:"7 天降雨",temp:"日最高温均值 / 距平",root:"根区湿润度 / 距平",hot:"≥35°C 天数 / 生育期相关高温天数",ge:"优良率",delta:"较上周（百分点）",
    no:"资料不足",yes:"筛查命中",notTriggered:"筛查未命中（不等于没有农业风险）",detail:"来源、输入版本与方法",report:"官方报告周末日期 / 发布日期",
    supply:"美国玉米供需：独立的官方证据",supplyMissing:"当前发布缺少合格的美国 PSD 分项或可比修订；不能据天气推断供应变化。",
    noRevision:"本次没有可比的美国玉米供需修订；不等于估计不会变化。",production:"产量",stocks:"期末库存",yield:"单产",area:"收获面积",
    reference:"已完成年度的 NASS 参考值（不是本季预测）",stageNote:"州内各农田进度不同。累计达到里程碑的比例不等于目前处在该阶段的比例；缺报阶段不补零。日历是本站近似模板。",
    method:"7 天逐日最高温均值、降雨合计及根区湿润度，与同网格 1991–2020 每年同日结束的 7 天窗口比较。高温：相关生育期内至少 3 天 ≥35°C；水分：整个窗口相关，且降雨和根区湿润度均低于各自第 20 百分位。均为未校准筛查，不是损伤模型。",baseline:"历史基线",raw:"原始每日值",release:"发布版本",annual:"NASS 年报",progress:"NASS 作物进度",agronomy:"农学依据",healthy:"计算可用",partial:"部分覆盖",unavailable:"暴露计算不可用"},
  en:{title:"US Corn · Corn Belt pilot",intro:"Production geography → crop stage → potential weather exposure | official crop condition | USDA supply revision. Separate evidence, not proof of causation.",
    missing:"This release has no usable pilot artifact yet. Awaiting validated official reports, point weather and the 1991–2020 baseline; missing evidence is not zero exposure.",
    archive:"Historical release only; not current conditions.",period:"Common weather window (UTC)",weight:"Weight year / report date",coverage:"Ten-state share of US production",
    assessed:"Production share associated with assessable points",unknown:"Missing evidence within pilot",outside:"States outside pilot",heat:"Production share associated with heat-screened points",moisture:"Production share associated with moisture-screened points",
    limit:"Shares associate state production with one representative grid point. They are not state-wide weather coverage, affected acreage, damaged production or expected yield loss. Missing regions are not renormalized.",
    where:"Region / national production share",when:"Crop-stage evidence",weather:"Point weather / anomaly",condition:"Official crop condition",estimated:"Calendar estimate",official:"Official cumulative progress",majority:"Milestone reached by at least half",
    rain:"7-day rainfall",temp:"Mean daily maximum / anomaly",root:"Root-zone wetness / anomaly",hot:"Days ≥35°C / stage-relevant hot days",ge:"Good/excellent",delta:"Change from prior week (percentage points)",
    no:"Insufficient evidence",yes:"Screen triggered",notTriggered:"Screen not triggered (not an absence of agricultural risk)",detail:"Sources, input versions & method",report:"Official week ending / publication date",
    supply:"US corn supply: independent official evidence",supplyMissing:"No eligible US PSD component or comparable revision in this release; supply changes cannot be inferred from weather.",
    noRevision:"No comparable US corn supply revision in this evaluation; estimates may still change.",production:"Production",stocks:"Ending stocks",yield:"Yield",area:"Harvested area",
    reference:"Completed-year NASS reference (not this season's forecast)",stageNote:"Fields within a state differ. Cumulative milestones are not percentages currently in a stage. Unreported stages stay missing. Calendars are approximate WFL templates.",
    method:"Seven-day mean daily maximum temperature, total rain and mean root-zone wetness versus matching-calendar seven-day windows in each year of 1991–2020 at the same grid point. Heat: at least 3 stage-relevant days ≥35°C. Moisture: the whole window is relevant and both rainfall and root wetness fall below their 20th percentiles. Uncalibrated screens, not damage models.",baseline:"Historical baseline",raw:"Raw daily observations",release:"Release",annual:"NASS annual report",progress:"NASS crop progress",agronomy:"Agronomic rationale",healthy:"Calculation available",partial:"Partial coverage",unavailable:"Exposure unavailable"},
};
const STAGES={off:["非生长期","Off season"],planting:["播种","Planting"],emergence:["出苗","Emergence"],vegetative:["营养生长","Vegetative"],silking:["吐丝 / 授粉","Silking / pollination"],grainFill:["灌浆","Grain fill"],maturity:["成熟","Maturity"],harvest:["收获","Harvest"],planted:["已播种","Planted"],emerged:["已出苗","Emerged"],dough:["糊熟","Dough"],dented:["凹粒","Dented"],mature:["已成熟","Mature"],harvested:["已收获","Harvested"]};
const number=v=>Number.isFinite(v)?v.toLocaleString("en-US",{maximumFractionDigits:2}):"—";
const pct=v=>Number.isFinite(v)?`${number(v*100)}%`:"—";
export function CornPilotView({artifact:a,lang="zh",archive=false}) {
  const t=LABELS[lang],stage=k=>STAGES[k]?.[lang==="zh"?0:1]??"—";
  return <article className="fs-card corn-pilot" id="us-corn-pilot"><h3>{t.title}</h3><p>{t.intro}</p>
    <p>{lang==="zh"?"独立的本次发布窗口，不随下方历史月份选择切换。NASA POWER 为网格化估计，不是田间实测；根区湿润度为 0–1 指标。":"Independent release window; the historical-month controls below do not change this pilot. NASA POWER provides gridded estimates, not field measurements; root-zone wetness is a 0–1 index."}</p>
    {!a?<p>{t.missing}</p>:<>
      {archive&&<p className="fs-notice">{t.archive}</p>}
      <p>{t.period}: {a.period.start} – {a.period.end} · {a.eligibility==="eligible"?t.healthy:a.eligibility==="partial"?t.partial:t.unavailable}</p>
      <p>{t.weight}: {a.weightYear??"—"} / {a.weightPublication??"—"}</p>
      <div className="fs-two"><div><p>{t.coverage}: {pct(a.coverage?.pilot)}</p><p>{t.assessed}: {pct(a.coverage?.assessed)}</p><p>{t.unknown}: {pct(a.coverage?.missing)} · {t.outside}: {pct(a.coverage?.outsidePilot)}</p></div>
        <div><p>{t.heat}: {pct(a.exposure.heat)}</p><p>{t.moisture}: {pct(a.exposure.moisture)}</p></div></div>
      <p className="fs-notice">{t.limit}</p><p>{t.stageNote}</p>
      <details className="fs-details"><summary>{lang==="zh"?"十州证据明细（可横向滚动）":"Ten-state evidence (scroll horizontally)"}</summary>
      <div className="fs-calendar-scroll" role="region" tabIndex="0" aria-label={t.title}><table className="fs-calendar"><thead><tr><th>{t.where}</th><th>{t.when}</th><th>{t.weather}</th><th>{t.condition}</th></tr></thead><tbody>
        {a.regions.map(r=><tr key={r.id}><th scope="row">{r.name[lang]}<p>{pct(r.productionWeight)}</p><small>{r.point.lat}, {r.point.lon}</small></th>
          <td>{t.estimated}: {stage(r.stage.estimated)}{r.stage.officialProgress&&<><p>{t.official} · {r.stage.weekEnding}</p>{Object.entries(r.stage.officialProgress).map(([key,value])=><div key={key}>{stage(key)}: {number(value)}%</div>)}<p>{t.majority}: {stage(r.stage.officialMajorityMilestone)}</p></>}</td>
          <td>{r.weather?<><p>{t.temp}: {number(r.weather.maxMean)} / {number(r.weather.maxAnomaly)} °C</p><p>{t.rain}: {number(r.weather.rainTotal)} mm / Δ {number(r.weather.rainAnomaly)} mm</p><p>{t.root}: {number(r.weather.rootMean)} / {number(r.weather.rootAnomaly)}</p><p>{t.hot}: {r.weather.heatDays} / {r.weather.relevantHeatDays}</p><p>{r.weather.heat||r.weather.moisture?t.yes:t.notTriggered}</p></>:<>{t.no}<p>{r.reasons.map(x=>reasonText(x,lang)).join(" · ")}</p></>}</td>
          <td>{r.officialCondition?<><p>{r.officialCondition.weekEnding}</p><p>{t.ge}: {number(r.officialCondition.goodExcellent)}%</p><p>{t.delta}: {number(r.officialCondition.deltaPoints)}</p></>:t.no}</td></tr>)}
      </tbody></table></div></details>
      {a.officialReport&&<p>{t.report}: {a.officialReport.weekEnding} / {a.officialReport.publishedDate} · <a href={a.officialReport.url} target="_blank" rel="noreferrer">{t.progress}</a></p>}
      <h4>{t.supply}</h4>{a.supply.eligible?<><p>{a.supply.period} · {a.supply.vintage}: {t.production} {number(a.supply.current.production)}, {t.stocks} {number(a.supply.current.endingStocks)} ({a.supply.current.unit})</p>
        {a.supply.revisions.length?<ul>{a.supply.revisions.map(c=><li key={c.id}>{c.field==="production"?t.production:t.stocks}: {number(c.previous)} → {number(c.current)} ({c.unit}) · {c.previousVersion.vintage} → {c.currentVersion.vintage}</li>)}</ul>:<p>{t.noRevision}</p>}</>:<p>{t.supplyMissing}</p>}
      {a.supply.annualReference&&<p>{t.reference} · {a.supply.annualReference.year}: {t.yield} {number(a.supply.annualReference.yield)} {a.supply.annualReference.yieldUnit} · {t.area} {number(a.supply.annualReference.harvestedArea)} {a.supply.annualReference.areaUnit}</p>}
      {a.supply.annualRevisions?.length>0&&<ul>{a.supply.annualRevisions.map(c=><li key={c.id}>{t.annual} · {c.observation.period} · {c.observation.commodity==="maize-yield"?t.yield:c.observation.commodity==="maize-harvestedArea"?t.area:t.production}: {number(c.previous)} → {number(c.current)} ({c.unit})</li>)}</ul>}
      <details className="fs-details"><summary>{t.detail}</summary><p>{t.method}</p><p>{t.baseline}: {config.baseline}</p>
        <p><a href={config.productionSource}>{t.annual}</a> · <a href={config.progressSource}>{t.progress}</a> · <a href={config.agronomySource}>{t.agronomy}</a></p>
        <small style={{overflowWrap:"anywhere"}}>{t.release}: {a.releaseId}</small>
        {a.regions.map(r=><details key={r.id}><summary>{r.name[lang]} · {t.raw}</summary><pre style={{maxWidth:"100%",overflowX:"auto"}}>{JSON.stringify({stage:r.stage,weather:r.weather,inputVersions:r.inputVersions},null,2)}</pre></details>)}
      </details>
    </>}
  </article>;
}
export default function USCornPilot({lang}) {
  const [feed,setFeed]=useState(null);
  useEffect(()=>{const controller=new AbortController();loadAlertFeed(controller.signal).then(setFeed).catch(()=>{});return ()=>controller.abort();},[]);
  return <CornPilotView artifact={feed?.analysis?.cornPilot} lang={lang} archive={feed?.stale}/>;
}

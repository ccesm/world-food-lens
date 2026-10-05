import React, {useEffect,useState} from "react";
import {officialSources, sourceStateLabel} from "../services/officialSources.js";
import {datasetHealth,reasonText} from "../services/dataHealth.js";
import {validSourceData} from "../services/officialSources.js";
import {loadAlertFeed,validateAlertFeed} from "../services/alertFeed.js";
import {spec} from "../services/dataContract.js";

export function HealthDetails({row,lang,snapshot=false}) {
  const zh=lang==="zh",m=row?.metadata;
  if(!m)return <small>{reasonText("invalid_format",lang)}</small>;
  return <details><summary>{zh?"资料健康与可用性":"Dataset health & usability"}</summary>
    <p>{zh?"资料展示":"Display"}: {row.displayUsable?(zh?"可用":"usable"):(zh?"不可用":"unavailable")} · {snapshot?(zh?"评估时可分析":"Analysis at assessment"):(zh?"当前分析":"Current analysis")}: {row.analysisUsable?(zh?"可用（仍需规则检查）":"usable, subject to rule checks"):(zh?"不可用":"unavailable")}</p>
    <p>{[...row.reasons,...(snapshot?row.evidence?.reasons??[]:[])].filter((x,i,a)=>a.indexOf(x)===i).map(code=>reasonText(code,lang)).join(" · ") || (zh?"检查通过":"Checks passed")}</p>
    <p>{zh?"缓存":"Cache"}: {spec.cacheLabels[m.cache]?.[lang]} · {zh?"文件 / 内容 / 日期核验":"Format / semantics / period"}: {[m.accepted.format,m.accepted.semantic,m.accepted.period].map(v=>({passed:zh?"通过":"passed",failed:zh?"失败":"failed",verified:zh?"已核实":"verified",unverified:zh?"待核实":"unverified",unknown:zh?"未知":"unknown"})[v]).join(" / ")}</p>
    {m.extensions.strengthExtraction&&<p>{zh?"强度语句提取":"Strength extraction"}: {m.extensions.strengthExtraction==="extracted"?(zh?"已提取明确证据":"Explicit evidence extracted"):(zh?"未可靠提取，不显示概率断言":"Not reliably extracted; no probability assertion")}</p>}
    <small>{zh?"发布版本":"Release"}: {row.release??(zh?"尚未关联到评估版本":"not linked to an evaluation")}</small>
  </details>;
}

export default function SourceDesk({bundle,lang,recovered}) {
  const zh = lang === "zh";
  const [feed,setFeed]=useState(null);
  useEffect(()=>{const controller=new AbortController();
    loadAlertFeed(controller.signal).then(setFeed).catch(()=>setFeed(null));
    return ()=>controller.abort();},[]);
  return <section id="data-desk" className="section">
    <div className="section-no">DATA DESK</div>
    <h2>{zh?"每个数字，都能追溯来源":"Every number should be traceable"}</h2>
    <p>{zh?"官方月度数据按发布节奏更新，不是实时行情。下方将观测期、成功抓取时间和最近尝试分开显示；抓取新文件不代表出现新观测值。":"Official monthly data follow the publisher’s release schedule, not real-time markets. Observation period, successful fetch and latest attempt are separate; a new fetch does not imply a new observation."}</p>
    <div className="desk">{Object.entries(officialSources).map(([key,definition])=>{
      const record = bundle.sources[key];
      const old = recovered.dataDesk.find(row => row.source === definition.label);
      return <div className="desk-row source-row" key={key}>
        <a className="source-link" href={record?.source?.url || definition.homepage} target="_blank" rel="noopener noreferrer">{definition.label} ↗</a>
        <span><small>{zh?"观测期 / 市场年度":"Observation / marketing year"}</small>{record?.source?.period || (definition.editorial?"—":old?.period || "—")}
          {record?.data?.releasePeriod && <small>{zh?"出版版本":"Publication vintage"}: {record.data.releasePeriod}</small>}
          {record?.source?.unit && <small>{record.source.unit}</small>}</span>
        <span><small>{zh?"成功抓取（UTC）":"Successful fetch (UTC)"}</small>{record?.fetchedAt || "—"}
          <small>{zh?"最近尝试":"Latest attempt"}: {record?.lastAttemptAt || "—"}</small></span>
        <div className="source-health"><em>{definition.editorial?(zh?"官方查询入口 · 未自动同步":"Official lookup · not auto-synced"):sourceStateLabel(record,lang,key)}</em>
          {!definition.editorial&&<HealthDetails row={datasetHealth(record,{key,valid:validSourceData(key,record?.data)})} lang={lang}/>}
          {record?.error && <details><summary>{zh?"错误详情":"Error details"}</summary><p>{record.error}</p></details>}
          {!record?.data && old && !definition.editorial && <small>{zh?"旧站历史记录抓取时间（非此次更新）":"Hosted-site historical fetch (not this refresh)"}: {old.lastSuccess}</small>}
        </div>
      </div>;
    })}</div>
    <details><summary>{zh?"查看同一评估版本的全部资料健康记录":"All datasets in one evaluation release"}</summary>
      <p>{feed?.dataHealth ? `${zh?"评估时间":"Assessed at"}: ${feed.dataHealth.assessedAt} · ${feed.release?.id??"—"}` :
        (zh?"下一次本地评估将生成完整资料健康记录；当前已发布旧格式，不补造历史记录。":"A subsequent evaluation will generate full health records; this published legacy feed has no fabricated historical metadata.")}</p>
      {feed&&validateAlertFeed(feed)?.stale&&<p role="status">{zh?"以下为过期评估快照，不代表当前状态。":"Historical evaluation snapshot, not current health."}</p>}
      {feed?.dataHealth?.datasets.map(row=><div className="desk-row source-row" key={row.id}>
        <span>{row.metadata?.provider??row.id}<small>{row.id}</small></span>
        <span>{row.metadata?.observation.period??"—"}<small>{zh?"出版版本":"Vintage"}: {row.metadata?.observation.vintage??"—"}</small></span>
        <span>{zh?"检查":"Checked"}: {row.metadata?.attempt.checkedAt??"—"}<small>{zh?"抓取":"Fetched"}: {row.metadata?.accepted.fetchedAt??"—"}</small></span>
        <div className="source-health"><HealthDetails row={row} lang={lang} snapshot/></div>
      </div>)}
    </details>
    <p className="snapshot-note">{zh?"政策事件库是人工核验的仓库记录，不是完整 FAPDA 镜像。EIA 不可用或观测期落后时，Brent 可采用 World Bank；卡片会标出实际来源。旧站恢复快照仅用于没有官方缓存时的回退。":"Policy events are editorially verified repository records, not a complete FAPDA mirror. Brent may use World Bank when EIA is unavailable or has an older observation; cards identify the selected source. Recovered hosted-site values are a last-resort fallback."}</p>
  </section>;
}

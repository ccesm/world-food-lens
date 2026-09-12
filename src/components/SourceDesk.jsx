import React from "react";
import {officialSources, sourceStateLabel} from "../services/officialSources.js";

export default function SourceDesk({bundle,lang,recovered}) {
  const zh = lang === "zh";
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
          {record?.source?.unit && <small>{record.source.unit}</small>}</span>
        <span><small>{zh?"成功抓取（UTC）":"Successful fetch (UTC)"}</small>{record?.fetchedAt || "—"}
          <small>{zh?"最近尝试":"Latest attempt"}: {record?.lastAttemptAt || "—"}</small></span>
        <div className="source-health"><em>{definition.editorial?(zh?"官方查询入口 · 未自动同步":"Official lookup · not auto-synced"):sourceStateLabel(record,lang)}</em>
          {record?.error && <details><summary>{zh?"错误详情":"Error details"}</summary><p>{record.error}</p></details>}
          {!record?.data && old && !definition.editorial && <small>{zh?"旧站历史记录抓取时间（非此次更新）":"Hosted-site historical fetch (not this refresh)"}: {old.lastSuccess}</small>}
        </div>
      </div>;
    })}</div>
    <p className="snapshot-note">{zh?"政策事件库是人工核验的仓库记录，不是完整 FAPDA 镜像。EIA 不可用或观测期落后时，Brent 可采用 World Bank；卡片会标出实际来源。旧站恢复快照仅用于没有官方缓存时的回退。":"Policy events are editorially verified repository records, not a complete FAPDA mirror. Brent may use World Bank when EIA is unavailable or has an older observation; cards identify the selected source. Recovered hosted-site values are a last-resort fallback."}</p>
  </section>;
}

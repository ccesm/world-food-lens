import React,{useEffect,useState} from "react";
import {ALERT_REVIEWED} from "../data/cropWeatherAlerts.js";
import {alertSnapshot} from "../services/cropWeatherAlerts.js";

export default function CropWeatherAlerts({lang}) {
  const zh=lang==="zh",[level,setLevel]=useState("all"),[now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return ()=>clearInterval(timer);},[]);
  const snapshot=alertSnapshot(now,level);
  return <section id="crop-weather-alerts" className="crop-weather-alerts" aria-labelledby="weather-alert-title">
    <h3 id="weather-alert-title">{zh?"今年产区天气与收成警戒清单":"This year’s crop-weather impact watchlist"}</h3>
    <p>{zh?"独立报告清单：不随下方天气年月或作物筛选改变，也不代表所选历史月份当时已知的信息。天气可能已经结束，收成影响仍在评估。":"Independent report list: not filtered by the weather year/month or crop below, nor a reconstruction of what was known in a selected historical month. Weather may have ended while harvest impacts remain under assessment."}</p>
    <div className="fs-notice"><b>{zh?"红黄为 WFL 关注等级，不是官方气象预警颜色":"Colors are WFL attention levels, not official meteorological warnings"}</b><p>{zh?"红色：官方报告描述严重农业影响；黄色：中等影响或仍待确认的风险。不是灾害实时追踪，不参与全球压力评分，也不据此预测价格。":"Red: severe agricultural impacts described by official reports. Yellow: moderate impacts or risks awaiting confirmation. Not live disaster tracking; excluded from global stress scores and price predictions."}</p></div>
    <p>{zh?"人工核验":"Manually reviewed"}: {ALERT_REVIEWED} · {zh?"覆盖：欧洲、中美洲、非洲与巴基斯坦的部分官方报告；非完整全球清单。未列出不代表安全。":"Coverage: selected official reports for Europe, Central America, Africa and Pakistan—not a complete global list. Omission does not imply safety."}</p>
    {snapshot.stale&&<p role="status" className="fs-notice">{zh?"清单已超过 30 天未复核或日期不可验证，仅供报告存档参考，不应视为当前警戒。":"Review older than 30 days or date unverifiable: report archive only, not current alerts."}</p>}
    <div className="fs-controls"><label className="fs-control">{zh?"关注等级":"Attention level"}<select value={level} onChange={e=>setLevel(e.target.value)}><option value="all">{zh?"全部":"All"}</option><option value="red">{zh?"红色关注":"Red attention"}</option><option value="yellow">{zh?"黄色关注":"Yellow attention"}</option></select></label><span role="status">{zh?`已收录报告分组：红 ${snapshot.red} · 黄 ${snapshot.yellow}（不是受灾国家数）`:`Recorded report groups: red ${snapshot.red} · yellow ${snapshot.yellow} (not affected-country counts)`}</span></div>
    <div className="fs-factor-grid">{snapshot.rows.map(r=><article className={`fs-card weather-alert-${r.level}`} key={r.id}>
      <b className="weather-alert-label">{snapshot.stale?(zh?"存档 · ":"Archive · "):""}{r.level==="red"?(zh?"红色关注 · 严重影响报告":"Red attention · severe impacts reported"):(zh?"黄色关注 · 影响或风险待跟踪":"Yellow attention · impact / risk watch")}</b>
      <h3>{r.region[lang]}</h3><b>{r.hazard[lang]}</b><p>{r.crop[lang]} · {r.period[lang]}</p><p>{r.impact[lang]}</p><small>{r.evidence[lang]}</small>
      <div className="fs-provenance"><span>{zh?"报告发布":"Published"}: {r.source.date} · {r.source.name}</span><a href={r.source.url} target="_blank" rel="noreferrer">{zh?"阅读官方报告（非官方红黄预警）":"Read official report (not an official color warning)"} ↗</a></div>
    </article>)}</div>
    {!snapshot.rows.length&&<p role="status">{zh?"没有符合条件的本年度已核验记录；这不代表没有极端天气。":"No reviewed current-year records match; this does not mean no extreme weather exists."}</p>}
  </section>;
}

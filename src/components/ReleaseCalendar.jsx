import React,{useState} from "react";
import {buildReleaseCalendar} from "../services/releaseCalendar.js";
import {releaseSources,scheduleCheckedAt} from "../data/releaseSchedule.js";
import "../outlook.css";

export default function ReleaseCalendar({lang}) {
  const zh=lang==="zh",[filter,setFilter]=useState("all"),[onlyConfirmed,setOnlyConfirmed]=useState(false);
  const {today,endDate,events}=buildReleaseCalendar();
  const visible=events.filter(e=>(filter==="all"||e.source.id===filter)&&(!onlyConfirmed||e.confirmed));
  const months=[...new Set(visible.map(e=>e.month))];
  const checkedAge=(Date.parse(today)-Date.parse(scheduleCheckedAt))/86400000;
  return <section id="release-calendar" className="section alt outlook-section">
    <div className="section-no">OFFICIAL RELEASE CALENDAR</div><h2>{zh?"下一批官方数据，什么时候发布？":"When will the next official data arrive?"}</h2>
    <p>{zh?`未来一年：${today} 至 ${endDate}。官网排期人工核对：${scheduleCheckedAt}。日期标签区分官方已排期与本站预计窗口；到期不等于已发布。`:`One-year window: ${today} to ${endDate}. Official schedules reviewed on ${scheduleCheckedAt}. Labels distinguish official schedules from planning estimates; a scheduled date is not proof of release.`}</p>
    {checkedAge>30&&<div className="notice">{zh?"日历已超过 30 天未人工核对，请以来源网站为准。":"This calendar has not been manually verified in over 30 days; check the source websites."}</div>}
    <div className="release-cadence">{releaseSources.map(source=><article key={source.id}><a className="source-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a><h3>{zh?source.cadenceZh:source.cadenceEn}</h3><p>{zh?source.impactZh:source.impactEn}</p></article>)}</div>
    <div className="release-controls"><label>{zh?"数据来源":"Source"}<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{zh?"全部来源":"All sources"}</option>{releaseSources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label><input type="checkbox" checked={onlyConfirmed} onChange={e=>setOnlyConfirmed(e.target.checked)}/>{zh?"仅看官方已排期":"Official schedules only"}</label></div>
    <p className="outlook-note">{zh?"2026 年 WASDE / FAO 的已公布日期和 NOAA 明确公布的下一期日期已录入。其余使用预计窗口：FAO、World Bank 为月初 1–10 日，WASDE 为 8–15 日，NOAA 为第二个星期四所在的 8–14 日；均需官网确认。2027 年完整排期尚未核实。":"Published 2026 WASDE / FAO dates and NOAA's explicitly announced next release are included. Other entries are estimated planning windows: days 1–10 for FAO/World Bank, 8–15 for WASDE, and 8–14 for NOAA's usual second Thursday. Verify all estimates at source. Full 2027 schedules have not been verified."}</p>
    <div className="release-timeline">{months.map(month=><article key={month} className="release-month"><h3>{month}</h3><ul>{visible.filter(e=>e.month===month).map(e=><li key={e.id}><div><b>{e.confirmed?e.start:`${e.start} – ${e.end}`}</b><span className={e.confirmed?"release-confirmed":"release-estimated"}>{e.confirmed?(zh?"官方已排期":"Officially scheduled"):(zh?"预计窗口 · 待确认":"Estimated · unconfirmed")}</span></div><a href={e.source.url} target="_blank" rel="noopener noreferrer">{e.source.name} ↗</a>{e.time&&<small>{zh?"12:00 美国东部时间（夏令时自动按当地规定调整）":"12:00 US Eastern (local daylight-saving rules apply)"}</small>}</li>)}</ul></article>)}</div>
    {!visible.length&&<p>{zh?"当前筛选没有匹配的发布日期。":"No releases match these filters."}</p>}
    <p className="outlook-note">{zh?"报告发布 → 官方文件更新 → 网站每日刷新 → 图表与模型重算。各步骤可能有延迟；页面“检查更新”只读取本站已发布缓存。未来报告数值尚未公布，日历不预填这些数值。":"Report release → official file update → daily website refresh → charts and model recalculation. Delays are possible; Check updates only reads the site's published cache. Future report values are not yet known and are never prefilled here."}</p>
  </section>;
}

import React,{useEffect,useState} from "react";
import points from "../data/weatherPoints.json";
import {CROP_NAMES} from "../data/cropCalendars.js";
import {weatherSummary} from "../services/localWeather.js";

export default function LocalCropWeather({bundle,rows,month,lang,selection,setSelection}){
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return ()=>clearInterval(timer);},[]);
  const crop=rows.find(r=>r.id===selection)||rows[0];
  const point=points.find(p=>p.crops.includes(crop?.id));
  const record=bundle?.points?.[point?.id],s=crop&&weatherSummary(record,crop,month,now);
  const zh=lang==="zh",n=x=>x.toFixed(1);
  return <div className="local-weather fs-card">
    <h3>{zh?"产区当地天气：最近 30 天":"Local crop weather: latest 30 days"}</h3>
    <p>{zh?"NASA POWER 网格化气象估计，非气象站或田间实测。每个区域仅选一个代表点，不能代表全国，也没有按耕地面积加权。":"NASA POWER gridded meteorological estimates, not station or field measurements. One illustrative point per region, not a country average or crop-area weighted measure."}</p>
    <label className="fs-control">{zh?"查看产区 / 作物":"Region / crop"}<select value={crop?.id||""} onChange={e=>setSelection(e.target.value)}>{rows.map(r=><option key={r.id} value={r.id}>{r.region[lang]} · {CROP_NAMES[r.crop][lang]}</option>)}</select></label>
    <p>{zh?"代表点":"Representative point"}: {point?.label??"—"}</p>
    {!s?<p role="status">{zh?"该点暂无完整的 30 天有效数据；不能判断当地影响。":"No complete valid 30-day record for this point; local impact cannot be assessed."}</p>:<>
      <p>{s.start} → {s.end} · UTC · {zh?`资料滞后 ${s.lag} 天`:`Data lag: ${s.lag} days`}</p>
      {s.stale&&<p className="fs-notice">{zh?"更新失败或缓存过期：仅供查看历史，不用于当前影响解读。":"Refresh failed or cache is stale: historical display only, not current impact interpretation."}</p>}
      <div className="fs-two"><div><b>{zh?"温度暴露":"Temperature exposure"}</b><p>{zh?"最高 / 最低":"Highest / lowest"}: {n(s.max)} / {n(s.min)} °C<br/>{zh?"最高温 ≥35°C":"Max ≥35°C"}: {s.heat} {zh?"天":"days"}<br/>{zh?"最低温 ≤0°C":"Min ≤0°C"}: {s.cold} {zh?"天":"days"}</p></div><div><b>{zh?"水分线索":"Rainfall context"}</b><p>{zh?"30 天累计":"30-day total"}: {n(s.rain)} mm<br/>{zh?"最长连续日雨量 <1 mm":"Longest run below 1 mm/day"}: {s.dry} {zh?"天":"days"}</p></div></div>
      <div className="fs-notice"><b>{zh?"如何与作物阶段一起读？":"How does this relate to crop stage?"}</b>
        {!s.interpret?<p>{zh?"非本月选择或资料已过期：不要将这段天气套用到所选月份的生育期。":"Non-current month or stale data: do not apply this weather window to the selected month's crop stage."}</p>:<p>{zh?`这 30 天中，有 ${s.sensitiveDays} 天与模板中的开花/授粉或灌浆阶段重叠，其中 ${s.sensitiveHeat} 天最高温达到 35°C。`:`Of these 30 days, ${s.sensitiveDays} overlap template flowering/pollination or grain fill; ${s.sensitiveHeat} of those reach 35°C.`} {zh?"重叠时应进一步核对结实、灌浆与供水情况；未重叠不表示安全。":"Where they overlap, check kernel set, grain fill and water supply; no overlap does not mean no risk."}</p>}
        <p>{zh?"35°C、0°C、1 mm 是透明的天气筛查刻度，不是各作物统一受损阈值。少雨不等于干旱：尚未结合历史常年值、土壤水分、灌溉、积雪与品种，因此不计算减产或冻死概率，也不计入全球综合分。":"35°C, 0°C and 1 mm are transparent weather-screening cutoffs, not universal crop-damage thresholds. Low rainfall is not drought: climate normals, soil moisture, irrigation, snow and cultivar data are not included. No yield-loss or winterkill probability or global-score contribution is calculated."}</p>
      </div>
      <details className="fs-details"><summary>{zh?"查看逐日数据":"Inspect daily values"}</summary><div className="fs-calendar-scroll"><table><thead><tr><th>{zh?"日期 UTC":"Date UTC"}</th><th>Max °C</th><th>Min °C</th><th>mm</th></tr></thead><tbody>{s.days.map(d=><tr key={d.date}><td>{d.date}</td><td>{n(d.max)}</td><td>{n(d.min)}</td><td>{n(d.rain)}</td></tr>)}</tbody></table></div></details>
    </>}
    <p className="fs-muted">{zh?"成功下载 / 最近尝试":"Successful fetch / last attempt"}: {record?.fetchedAt??"—"} / {record?.lastAttemptAt??"—"}</p>
    <a href="https://power.larc.nasa.gov/docs/faqs/data/" target="_blank" rel="noreferrer">NASA POWER · {zh?"来源与方法":"Sources & methodology"} ↗</a>
    {record?.url?.startsWith("https://power.larc.nasa.gov/api/")&&<a href={record.url} target="_blank" rel="noreferrer">{zh?"原始数据请求":"Original data request"} ↗</a>}
  </div>;
}

import React,{useEffect,useState} from "react";
import LocalCropWeather from "./LocalCropWeather";
import {cropCalendars,CROP_NAMES,STAGES,CALENDAR_REVIEWED} from "../data/cropCalendars.js";
import {stageForMonth,seasonalPriorities,winterExposure} from "../services/cropCalendar.js";
const copy={
  zh:{title:"全球作物关键窗口",intro:"现在的天气，对哪些作物阶段更重要？先用季节日历定位检查对象。以下全部是本站整理的近似生育期模板，不是今年实测进度，也不是实时天气风险排名。",
    month:"查看月份",crop:"作物",all:"全部作物",current:"回到本月",priorities:"本月应核对的关键生育期",none:"所选作物本月没有模板中的关键窗口。收获期仍可能受洪涝等影响，不代表没有风险。",estimated:"季节估计 · 置信度中",stage:"近似阶段",weather:"当地天气：尚未接入",source:"日历参考来源",reviewed:"模板整理日期",sensitivity:"生育期敏感度（本站规则）",priorityNote:"按生育期敏感度排序，同分按固定编号排序；不是按国家重要性排序。未接入地区天气、产区份额和贸易权重，不计算全球农业天气风险或同步受灾分数。",
    calendar:"展开 12 个月季节日历",calendarHelp:"可横向滚动；点击月份格查看该月份，颜色之外还提供阶段缩写。各地播期、品种、灌溉和早晚季不同，这些代表性窗口不能覆盖全国所有农田。",region:"代表产区 / 作物",synchronization:"同步压力：尚无法判断",syncText:"进入敏感期 ≠ 正在受灾。目前没有可比的地区天气观测，因此不显示“0 个产区受灾”或正常绿色状态。",
    why:"为何关注这个阶段？",explain:{maize:"授粉时高温与缺水可能妨碍结实；收获后的干旱不能按同样权重解释。",soybeans:"开花、结荚和籽粒形成阶段的胁迫可能影响产量；此模板把结荚与籽粒形成合并展示。",rice:"抽穗开花期的极端高温可能增加不育风险，实际影响还取决于水分管理。",winterWheat:"越冬损伤需结合积雪和冠部温度；抽穗与灌浆期热旱可能影响穗粒与粒重。",springWheat:"抽穗开花和灌浆阶段的热旱，需要结合田间作物状况判断。",barley:"抽穗与灌浆是重要观察窗口，不直接等同于发生减产。",canola:"开花和角果形成阶段需要关注热旱；区域和品种会改变窗口。"},
    winter:"冬季冻害：联合条件检查",winterIntro:"积雪有保温作用，气温很低不等于植株必然死亡。以下为教育性手动检查，与上方观测和评分完全分开。",
    checks:{winterCrop:"田间存在越冬小麦？",severeCold:"发生了严重低温？",lowSnow:"缺乏保护性积雪？",prolonged:"低温持续较长时间？"},unknown:"未知",yes:"是",no:"否",winterResults:{unknown:"信息不足：先确认作物暴露与天气。","joint-exposure":"四个条件同时存在：值得进一步核查冠部/土壤温度与田间损伤，不代表必然冻死。","not-all-present":"未同时满足四项条件；这不排除其他冻害、冰壳、冻融或苗情风险。"},winterNote:"尚未接入积雪、冠部温度、抗寒锻炼、冻融或冰壳数据。没有统一适用于所有品种的气温阈值，因此不生成冻死概率。",winterSource:"K-State 冬麦越冬说明"},
  en:{title:"Global Crop Critical Window",intro:"Where could weather matter most now? Use the seasonal calendar to choose what to check. All entries are approximate WFL stage templates, not measured current-year progress or a live weather-risk ranking.",
    month:"Selected month",crop:"Crop",all:"All crops",current:"Current month",priorities:"Critical stages to check this month",none:"No template critical window for the selected crop this month. Harvest can still be affected by flooding; this is not a no-risk assessment.",estimated:"Seasonal estimate · medium confidence",stage:"Approximate stage",weather:"Local weather: not connected",source:"Calendar reference",reviewed:"Template compiled",sensitivity:"Stage sensitivity (WFL rule)",priorityNote:"Sorted by stage sensitivity, then stable ID—not country importance. Regional weather, production shares and trade weights are not connected, so no global agricultural weather or synchronized-damage score is calculated.",
    calendar:"Explore the 12-month crop calendar",calendarHelp:"Scroll horizontally if needed; select a month cell to inspect it. Stage codes supplement color. Planting dates, cultivars, irrigation and multiple seasons vary; representative templates do not describe every field in a country.",region:"Representative region / crop",synchronization:"Synchronized stress: unknown",syncText:"A sensitive stage is not evidence of damage. Without comparable regional weather observations, we do not show zero affected regions or a green normal status.",
    why:"Why this stage matters",explain:{maize:"Heat and water stress at pollination can affect kernel set. Post-harvest drought should not receive the same interpretation.",soybeans:"Stress around flowering, pod set and seed fill can affect yield. This template groups pod set and seed fill together.",rice:"Extreme heat around heading and flowering can raise sterility risk; actual effects depend on water management.",winterWheat:"Winter injury depends on snow and crown temperature. Heat and drought at heading and grain fill can affect kernel formation and weight.",springWheat:"Heat and drought around heading, flowering and grain fill require field-condition checks.",barley:"Heading and grain fill are important monitoring windows, not evidence of an actual yield loss.",canola:"Heat and drought during flowering and pod formation warrant monitoring; cultivars and regions shift timing."},
    winter:"Winterkill: joint-exposure checklist",winterIntro:"Snow insulates the crop. Very cold air does not guarantee plant death. This educational manual checklist is separate from all observations and scores above.",
    checks:{winterCrop:"Winter wheat present in the field?",severeCold:"Severe cold observed?",lowSnow:"Insufficient protective snow?",prolonged:"Prolonged cold exposure?"},unknown:"Unknown",yes:"Yes",no:"No",winterResults:{unknown:"Insufficient information: establish crop exposure and weather first.","joint-exposure":"All four conditions present: check crown/soil temperatures and field injury. This does not guarantee winterkill.","not-all-present":"Not all four conditions present; other injury, ice crust, freeze/thaw or establishment risks remain possible."},winterNote:"Snow, crown temperature, hardening, freeze/thaw and ice crust data are not connected. Air-temperature thresholds vary by cultivar and conditions; no mortality probability is generated.",winterSource:"K-State winter wheat guidance"},
};

export default function CropCriticalWindow({lang}) {
  const t=copy[lang],currentMonth=new Date().getUTCMonth()+1;
  const [month,setMonth]=useState(currentMonth),[crop,setCrop]=useState("all"),[checks,setChecks]=useState({});
  const [weather,setWeather]=useState(null),[weatherSelection,setWeatherSelection]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/local-weather.json`,{cache:"no-store",signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error("Weather cache unavailable");return r.json();})
      .then(data=>{if(data.schemaVersion===1&&data.points&&typeof data.points==="object")setWeather(data);})
      .catch(()=>{});
    return ()=>controller.abort();
  },[]);
  const monthName=m=>new Intl.DateTimeFormat(lang==="zh"?"zh-CN":"en",{month:"short",timeZone:"UTC"}).format(new Date(Date.UTC(2020,m-1,1)));
  const rows=cropCalendars.filter(r=>crop==="all"||r.crop===crop),priorities=seasonalPriorities(rows,month);
  return <section id="crop-windows" className="section food-system">
    <div className="section-no">SEASONAL EXPOSURE / GRID WEATHER</div><h2>{t.title}</h2><p>{t.intro}</p>
    <div className="fs-controls"><label className="fs-control">{t.month}<select aria-label={t.month} value={month} onChange={e=>setMonth(+e.target.value)}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{monthName(i+1)}</option>)}</select></label>
      <label className="fs-control">{t.crop}<select aria-label={t.crop} value={crop} onChange={e=>setCrop(e.target.value)}><option value="all">{t.all}</option>{Object.entries(CROP_NAMES).map(([key,name])=><option key={key} value={key}>{name[lang]}</option>)}</select></label>
      <button type="button" onClick={()=>setMonth(currentMonth)}>{t.current}</button></div>
    <h3>{t.priorities} · {monthName(month)}</h3><p className="fs-muted">{lang==="zh"?"按季节模板敏感度排序，不是按天气损伤或国家重要性排名。下方代表点天气供逐项核对；尚无产区面积、产量与贸易权重。":"Sorted by seasonal stage sensitivity, not weather damage or country importance. Point weather below supports inspection; crop-area, production and trade weights are not connected."}</p>
    <div className="fs-factor-grid">{priorities.slice(0,8).map(({record,stage})=><article className="fs-card" key={record.id}>
      <small>{t.estimated}</small><h3>{record.region[lang]} · {CROP_NAMES[record.crop][lang]}</h3><b>{t.stage}: {stage[lang]}</b>
      <p>{t.sensitivity}: {stage.sensitivity} / 100</p><p>{t.explain[record.crop]}</p><a href="#local-crop-weather" onClick={()=>setWeatherSelection(record.id)}>{lang==="zh"?"查看该产区代表点天气（非受灾判定）":"Inspect this region's point weather (not damage assessment)"} ↓</a>
      <a href={record.source} target="_blank" rel="noreferrer">{t.source} ↗</a>
    </article>)}</div>{!priorities.length&&<p>{t.none}</p>}
    <div id="local-crop-weather" style={{scrollMarginTop:115}}><LocalCropWeather bundle={weather} rows={rows} month={month} lang={lang} selection={weatherSelection} setSelection={setWeatherSelection}/></div>
    <div className="fs-notice"><b>{t.synchronization}</b><p>{lang==="zh"?"代表点天气不等于全产区受灾。尚缺作物面积权重与田间损伤验证，因此仍不计算同步受灾分数。":"Point weather is not region-wide crop damage. Crop-area weights and field-damage validation are missing, so synchronized-damage scores remain unavailable."}</p></div>
    <details className="fs-details"><summary>{t.calendar} · {cropCalendars.length}</summary><p>{t.calendarHelp}</p><p>{t.reviewed}: {CALENDAR_REVIEWED}</p>
      <div className="fs-stage-legend">{Object.entries(STAGES).map(([key,stage])=><span key={key} className={`fs-stage stage-${key==="-"?"off":key}`}>{key}: {stage[lang]}</span>)}</div>
      <div className="fs-calendar-scroll" tabIndex="0" role="region" aria-label={t.calendar}><table className="fs-calendar"><thead><tr><th>{t.region}</th>{Array.from({length:12},(_,i)=><th key={i}>{monthName(i+1)}</th>)}</tr></thead><tbody>
        {rows.map(row=><tr key={row.id}><th scope="row">{row.region[lang]}<small>{CROP_NAMES[row.crop][lang]}</small><a href={row.source} target="_blank" rel="noreferrer">{t.source} ↗</a></th>{row.months.map((code,i)=><td key={i}><button className={`fs-stage stage-${code==="-"?"off":code}`} aria-pressed={month===i+1} aria-label={`${row.region[lang]}, ${monthName(i+1)}, ${STAGES[code][lang]}`} title={STAGES[code][lang]} onClick={()=>setMonth(i+1)}>{code}</button></td>)}</tr>)}
      </tbody></table></div>
    </details>
    <details className="fs-details"><summary>{t.winter}</summary><p>{t.winterIntro}</p><div className="fs-two">{Object.entries(t.checks).map(([key,label])=><label className="fs-control" key={key}>{label}<select aria-label={label} value={checks[key]===undefined?"unknown":String(checks[key])} onChange={e=>setChecks({...checks,[key]:e.target.value==="unknown"?undefined:e.target.value==="true"})}><option value="unknown">{t.unknown}</option><option value="true">{t.yes}</option><option value="false">{t.no}</option></select></label>)}</div><p role="status" className="fs-notice">{t.winterResults[winterExposure(checks)]}</p><p>{t.winterNote}</p><a href="https://eupdate.agronomy.ksu.edu/article_new/snow-cover-temperatures-and-wheat-condition-436-1" target="_blank" rel="noreferrer">{t.winterSource} ↗</a></details>
  </section>;
}

import React,{useEffect,useState} from "react";
import points from "../data/weatherPoints.json";
import {CROP_NAMES} from "../data/cropCalendars.js";
import {droughtPointSummary,soilMoistureSummary} from "../services/droughtMonitor.js";

const spiLabels={
  zh:{"extremely-dry":"极端偏干","severely-dry":"严重偏干","moderately-dry":"中度偏干","near-normal":"接近常年","moderately-wet":"中度偏湿","very-wet":"明显偏湿","extremely-wet":"极端偏湿","no-data":"该栅格无资料"},
  en:{"extremely-dry":"Extremely dry","severely-dry":"Severely dry","moderately-dry":"Moderately dry","near-normal":"Near normal","moderately-wet":"Moderately wet","very-wet":"Very wet","extremely-wet":"Extremely wet","no-data":"No data at this grid cell"},
};
const riskLabels={zh:{high:"高",medium:"中",low:"低","no-hotspot":"未显示彩色热点／未分类"},en:{high:"High",medium:"Medium",low:"Low","no-hotspot":"No coloured hotspot / unclassified"}};
const soilLabels={zh:{"very-dry":"低于历史第 10 百分位","drier":"低于历史第 25 百分位","near-normal":"历史中间范围","wetter":"高于历史第 75 百分位","very-wet":"高于历史第 90 百分位"},en:{"very-dry":"Below historical 10th percentile","drier":"Below historical 25th percentile","near-normal":"Historical middle range","wetter":"Above historical 75th percentile","very-wet":"Above historical 90th percentile"}};
const mapLabels={zh:{shortTerm:"短期 SPI · 1 个月",longTerm:"长期 SPI · 6 个月",impactRisk:"农业干旱影响风险"},en:{shortTerm:"Short-term SPI · 1 month",longTerm:"Long-term SPI · 6 months",impactRisk:"Agricultural drought impact risk"}};

export default function DroughtSoilMonitor({drought,weather,rows,month,year,lang,selection,setSelection}){
  const zh=lang==="zh",crop=rows.find(row=>row.id===selection)||rows[0];
  const point=points.find(item=>item.crops.includes(crop?.id));
  const now=Date.now(),droughtSummary=droughtPointSummary(drought,point?.id,now);
  const soil=soilMoistureSummary(weather?.points?.[point?.id],month,year,now);
  const [mapKey,setMapKey]=useState("shortTerm"),[mapFailed,setMapFailed]=useState(false);
  useEffect(()=>setMapFailed(false),[mapKey,drought?.fetchedAt]);
  const selectedMap=drought?.maps?.[mapKey];
  const n=value=>Number.isFinite(value)?value.toFixed(2):"—";
  return <div className="drought-soil-monitor">
    <div className="drought-soil-heading"><div><small>GDO / NASA POWER / REPRESENTATIVE POINTS</small><h3>{zh?"干旱与土壤水分":"Drought & soil moisture"}</h3></div><label className="fs-control">{zh?"产区 / 作物":"Region / crop"}<select value={crop?.id||""} onChange={event=>setSelection(event.target.value)}>{rows.map(row=><option key={row.id} value={row.id}>{row.region[lang]} · {CROP_NAMES[row.crop][lang]}</option>)}</select></label></div>
    <p>{zh?"同一个代表点连接三层证据：GDO 降水异常、GDO 农业影响风险背景，以及 NASA 模型土壤湿润度。一个点不能代表全国，任何颜色也不等于已经减产。":"One representative point connects three evidence layers: GDO precipitation anomaly, GDO agricultural-impact risk context and NASA modelled soil wetness. One point is not a country, and no colour proves a yield loss."}</p>
    <div className="drought-soil-grid">
      <section id="drought-monitor" className="drought-panel" aria-labelledby="drought-title">
        <small>{point?.label??"—"}</small><h4 id="drought-title">{zh?"干旱监测":"Drought monitor"}</h4>
        {!droughtSummary?<p role="status">{zh?"官方干旱缓存尚不可用；不显示正常或低风险替代值。":"Official drought cache is unavailable; no normal or low-risk substitute is shown."}</p>:<>
          {droughtSummary.stale&&<p className="fs-notice">{zh?"刷新失败或缓存过期，以下只作存档查看。":"Refresh failed or cache is stale; archive display only."}</p>}
          <dl className="climate-evidence-list">
            <div><dt>{mapLabels[lang].shortTerm}</dt><dd><b className={`climate-status ${droughtSummary.layers.shortTerm.value}`}>{spiLabels[lang][droughtSummary.layers.shortTerm.value]}</b><span>{droughtSummary.layers.shortTerm.period}{droughtSummary.layers.shortTerm.stale?(zh?" · 已过期":" · stale"):""}</span></dd></div>
            <div><dt>{mapLabels[lang].longTerm}</dt><dd><b className={`climate-status ${droughtSummary.layers.longTerm.value}`}>{spiLabels[lang][droughtSummary.layers.longTerm.value]}</b><span>{droughtSummary.layers.longTerm.period}{droughtSummary.layers.longTerm.stale?(zh?" · 已过期":" · stale"):""}</span></dd></div>
            <div><dt>{mapLabels[lang].impactRisk}</dt><dd><b className={`climate-status risk-${droughtSummary.layers.impactRisk.value}`}>{riskLabels[lang][droughtSummary.layers.impactRisk.value]}</b><span>{droughtSummary.layers.impactRisk.period}{droughtSummary.layers.impactRisk.stale?(zh?" · 已过期":" · stale"):""}</span></dd></div>
          </dl>
          <p className="fs-muted">{zh?"SPI 表示该栅格降水相对历史分布的位置。农业影响风险还含暴露与脆弱性，只可作热点筛查；“未显示热点”不是安全结论。":"SPI locates grid-cell precipitation within its historical distribution. Agricultural impact risk also includes exposure and vulnerability and is for hotspot screening; no coloured hotspot is not a safety finding."}</p>
        </>}
        <div className="drought-map-control"><label className="fs-control">{zh?"全球官方图层":"Official global layer"}<select value={mapKey} onChange={event=>setMapKey(event.target.value)}>{Object.keys(mapLabels[lang]).map(key=><option key={key} value={key}>{mapLabels[lang][key]}</option>)}</select></label></div>
        {selectedMap&&!mapFailed?<figure className="drought-map"><img src={selectedMap.url} onError={()=>setMapFailed(true)} alt={`${mapLabels[lang][mapKey]} · ${selectedMap.period}`} loading="lazy"/><figcaption>{selectedMap.period} · Copernicus GDO</figcaption></figure>:<p role="status">{zh?"全球图层暂时无法读取；上方缓存点值仍保留其原始资料日期。":"The global layer cannot be loaded; cached point classifications retain their source dates."}</p>}
        <div className="drought-legend" aria-label={zh?"SPI 图例":"SPI legend"}><span className="dry-3">{zh?"极端偏干":"Extreme dry"}</span><span className="dry-2">{zh?"严重偏干":"Severe dry"}</span><span className="dry-1">{zh?"中度偏干":"Moderate dry"}</span><span className="normal">{zh?"接近常年":"Near normal"}</span><span className="wet">{zh?"偏湿":"Wet"}</span></div>
        <a href="https://drought.emergency.copernicus.eu/tumbo/gdo/map/" target="_blank" rel="noreferrer">Copernicus GDO · {zh?"官方地图与方法":"Official map & methods"} ↗</a>
      </section>
      <section id="soil-moisture" className="drought-panel" aria-labelledby="soil-title">
        <small>{year}-{String(month).padStart(2,"0")} · {point?.label??"—"}</small><h4 id="soil-title">{zh?"土壤水分":"Soil moisture"}</h4>
        {!soil?<p role="status">{zh?"所选月份没有完整可比的土壤湿润度与常年值；不会用当前值替代。":"The selected month has no complete comparable soil-wetness data and normals; current values are not substituted."}</p>:<>
          <p>{soil.start} → {soil.end} · {soil.days} {zh?"天":"days"}{soil.partial?(zh?" · 当月未完整":" · partial month"):""}</p>
          {soil.stale&&<p className="fs-notice">{zh?"当前缓存更新失败或过期；历史月份仍可查看，但不作当前状态解读。":"Current cache failed or is stale. Historical months remain inspectable, but no current-state interpretation is made."}</p>}
          <dl className="climate-evidence-list">
            <div><dt>{zh?"根区湿润度":"Root-zone wetness"}</dt><dd><strong>{n(soil.root)}</strong><b className={`soil-status ${soil.rootBand}`}>{soilLabels[lang][soil.rootBand]}</b><span>{zh?"同月中位数":"Same-month median"}: {n(soil.rootNormal.median)}</span></dd></div>
            <div><dt>{zh?"表层湿润度":"Surface wetness"}</dt><dd><strong>{n(soil.surface)}</strong><b className={`soil-status ${soil.surfaceBand}`}>{soilLabels[lang][soil.surfaceBand]}</b><span>{zh?"同月中位数":"Same-month median"}: {n(soil.surfaceNormal.median)}</span></dd></div>
          </dl>
          <p className="fs-muted">{zh?`0–1 是 NASA POWER 的无量纲模型湿润度，不是田间体积含水率。历史带使用 ${soil.baseline} 年同月月均值；部分月份只能作初步比较。`:`0–1 is NASA POWER unitless model wetness, not field volumetric water content. Historical bands use same-month monthly means from ${soil.baseline}; partial months are provisional comparisons.`}</p>
          <div className="fs-notice"><b>{zh?"农业风险仍未自动评级":"Agricultural risk is still not auto-rated"}</b><p>{zh?"土壤偏干需要与作物敏感期、季节预测、灌溉和作物状况一起确认；它不会单独触发减产结论或全球分数。":"Dry soil must be checked against crop sensitivity, seasonal forecasts, irrigation and crop condition. It does not independently trigger a yield-loss result or global score."}</p></div>
        </>}
        <a href="https://power.larc.nasa.gov/docs/services/api/temporal/daily/" target="_blank" rel="noreferrer">NASA POWER · {zh?"每日资料与方法":"Daily data & methods"} ↗</a>
      </section>
    </div>
    <p className="fs-muted">{zh?"GDO 成功下载 / 最近尝试":"GDO successful fetch / last attempt"}: {drought?.fetchedAt??"—"} / {drought?.lastAttemptAt??"—"}</p>
  </div>;
}

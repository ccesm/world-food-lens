import React from "react";
import {validSpatial,selectSpatial,spatialReasonText} from "../services/cornSpatial.js";
import {config} from "../services/cornData.js";

export const SPATIAL_LABELS={
  en:{title:"Spatial weather evidence",method:"Mapped corn-area weighted weather",fallback:"Representative-point fallback",
    unavailable:"Spatial weather unavailable",scope:"Ten-state Corn Belt mapped-corn summary (not national)",
    boundary:"This describes weather over mapped corn-growing area. It does not represent confirmed crop damage, affected acreage, yield loss or local crop stage.",
    context:"USDA statewide crop progress, official crop condition and supply revisions remain separate evidence below. Existing weather screens and alerts still use Level A.",
    geography:"Weather over mapped corn geography from CDL year",proxy:"Older validated native-30m geography proxy; newer native-10m CDL is not yet validated here. Not this year's exact planted geography",window:"14-day gridMET window (nominal 07UTC day)",
    coverage:"Joint crop/weather coverage",area:"Mapped corn area",valid:"Corn area with valid weather",unknown:"Unknown",missing:"Unavailable states",
    tmax:"Mean daily Tmax",tmin:"Mean daily Tmin",rain:"14-day precipitation",state:"State / spatial method",units:"ha",details:"Coverage, source versions & reference-point diagnostics",
    no:"No healthy Level C source in this release. Valid Level A reference points, when available, are explicitly labeled fallback.",
    fallbackWindow:"Level A: existing 7-day UTC window; not comparable directly to this 14-day gridMET window",distribution:"Area-weighted mean; spatial P10–P90 in parentheses"},
  zh:{title:"空间天气证据",method:"按玉米制图面积加权的天气",fallback:"代表点回退",unavailable:"空间天气不可用",
    scope:"十州玉米带制图玉米面积汇总（不是全美国）",boundary:"这里描述玉米制图区域上的天气，不代表已确认作物损伤、受灾面积、减产或当地生育期。",
    context:"下方 USDA 州级作物进度、官方作物状况及供需修订保持独立。现有天气筛查和预警仍使用 Level A。",
    geography:"天气对应的玉米 CDL 制图年份",proxy:"较早已验证的原生 30 米地图代理；较新原生 10 米 CDL 尚未在此验证。不是今年精确播种分布",window:"gridMET 14 天窗口（名义日界 07UTC）",
    coverage:"作物与天气联合覆盖率",area:"玉米制图面积",valid:"有有效天气的玉米面积",unknown:"未知",missing:"不可用州",
    tmax:"每日最高温均值",tmin:"每日最低温均值",rain:"14 天累计降雨",state:"州 / 空间方法",units:"公顷",details:"覆盖、来源版本与代表点诊断",
    no:"本次发布没有健康的 Level C 来源。若 Level A 代表点有效，将明确标记为回退。",
    fallbackWindow:"Level A：原有 7 天 UTC 窗口，不能直接与本 14 天 gridMET 窗口比较",distribution:"面积加权均值；括号内为空间 P10–P90"},
};
const n=v=>Number.isFinite(v)?v.toLocaleString("en-US",{maximumFractionDigits:2}):"—";
const p=v=>Number.isFinite(v)?`${n(v*100)}%`:"—";
const stat=(s,unit)=>s?`${n(s.mean)} ${unit} (${n(s.p10)}–${n(s.p90)})`:"—";

export function CornSpatialWeather({artifact,levelA,health=[],lang="zh",now=Date.now(),archive=false}) {
  const t=SPATIAL_LABELS[lang],valid=validSpatial(artifact),rows=config.regions.map(region=>{
    const state=artifact?.states?.find(s=>s.state===region.id),reference=levelA?.regions.find(s=>s.id===region.id);
    return {region,state,selection:selectSpatial(state,reference?{...reference,period:levelA.period}:null,health,{now,artifactValid:valid&&!archive})};
  });
  const usable=rows.some(r=>r.selection.method==="mapped-corn-area-weighted");
  const aggregateHealthy=health.find(h=>h.id==="cornSpatial/ten-state")?.analysisUsable&&
    rows.filter(r=>r.state?.status==="ok").every(r=>r.selection.method==="mapped-corn-area-weighted");
  const combined=usable&&aggregateHealthy?artifact.combined:null;
  return <section aria-label={t.title}><h4>{t.title}</h4><p className="fs-notice">{t.boundary}</p><p>{t.context}</p>
    {combined?<><p>{t.scope} · {t.method}</p><p>{t.window}: {artifact.period.start} – {artifact.period.end}</p>
      <p>{t.geography}: {combined.cropGeographyYears.join(", ")}{artifact.states.some(s=>s.geographyUse==="validated-older-geography-proxy")&&<> · {t.proxy}</>}</p>
      <p>{t.area}: {n(combined.mappedCornAreaM2===null?null:combined.mappedCornAreaM2/10000)} {t.units} · {t.valid}: {n(combined.validWeatherAreaM2/10000)} {t.units} · {t.coverage}: {combined.coverage===null?t.unknown:p(combined.coverage)}</p>
      {combined.unavailableStates.length>0&&<p>{t.missing}: {combined.unavailableStates.join(", ")}</p>}
      <p>{t.distribution}</p><p>{t.tmax}: {stat(combined.weatherSummary.tmaxDailyMeanC,"°C")} · {t.tmin}: {stat(combined.weatherSummary.tminDailyMeanC,"°C")} · {t.rain}: {stat(combined.weatherSummary.precipitation14DayMm,"mm")}</p>
    </>:<p>{t.no}</p>}
    <details className="fs-details"><summary>{t.details}</summary><div className="fs-calendar-scroll" tabIndex="0" role="region" aria-label={t.title}>
      <table className="fs-calendar"><thead><tr><th>{t.state}</th><th>{t.geography} / {t.coverage}</th><th>{t.tmax} / {t.tmin}</th><th>{t.rain}</th></tr></thead><tbody>
        {rows.map(({region,state,selection:s})=><tr key={region.id}><th>{region.name[lang]}<p>{s.method==="mapped-corn-area-weighted"?t.method:s.method==="representative-point-fallback"?t.fallback:t.unavailable}</p></th>
          {s.method==="mapped-corn-area-weighted"?<><td>{state.cropGeographyYear}<p>{p(state.coverage)}</p></td><td>{stat(s.weather.tmaxDailyMeanC,"°C")}<p>{stat(s.weather.tminDailyMeanC,"°C")}</p></td><td>{stat(s.weather.precipitation14DayMm,"mm")}</td></>:
          <><td>{state?.reasons?.map(x=>spatialReasonText(x,lang)).join(" · ")||"—"}</td><td>{s.method==="representative-point-fallback"?<>{n(s.weather.maxMean)} °C<p>{t.fallbackWindow}</p><p>{levelA?.period.start} – {levelA?.period.end}</p></>:"—"}</td><td>{s.method==="representative-point-fallback"?`${n(s.weather.rainTotal)} mm (7d)`:"—"}</td></>}
        </tr>)}
      </tbody></table></div>
      {valid&&<pre style={{maxWidth:"100%",overflowX:"auto"}}>{JSON.stringify({methodVersion:artifact.methodVersion,gridVersion:artifact.gridVersion,
        releaseId:artifact.releaseId,sourceGeneratedAt:artifact.generatedAt,analysisHash:artifact.analysisHash,
        states:artifact.states.map(s=>({state:s.state,annualKey:s.annualKey,weatherVersions:s.weatherVersions,
          areaValidation:s.areaValidation,pointComparison:s.pointComparison,reasons:s.reasons}))},null,2)}</pre>}
    </details>
  </section>;
}

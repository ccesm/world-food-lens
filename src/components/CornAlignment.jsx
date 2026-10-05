import React from "react";
const pct=v=>Number.isFinite(v)?`${(v*100).toFixed(1)}%`:"—";
const range=v=>v?`${pct(v.lower)} – ${pct(v.upper)}`:"—";
const STAGES={planted:["已播种","Planted"],emerged:["已出苗","Emerged"],silking:["已吐丝","Silked"],dough:["已糊熟","Dough"],dented:["已凹粒","Dented"],mature:["已成熟","Mature"],harvested:["已收获","Harvested"]};
const text={
  zh:{title:"生育期—天气筛查暴露 · Phase 4B-1",method:"空间方法：州级代表点筛查（Level A）",
    boundary:"州级进度与单个 NASA 网格只在州标识上匹配，尚未观察到作物与天气的真实空间交集。这不是受灾面积、受损产量或减产预测。",
    production:"已知全国产量权重",stage:"生育期资料覆盖",weather:"天气资料覆盖",joint:"州级 / 时间联合资料覆盖",
    missing:"联合资料未覆盖",points:"可用天气样本数",exposure:"生育期—天气筛查暴露（全国产量等价范围）",heat:"既有高温筛查",moisture:"既有水分不足筛查",
    allocation:"范围是在同州各阶段单产相同、代表点筛查可作州级关联的假设下，将累计面积进度应用于产量权重的时间平均代理。进度面积口径尚未在缓存中证实为仅粮用玉米，权重则为粮用玉米产量。不是实测交集，也不是概率或统计置信区间；缺失份额不补零、不归一。",
    hold:"逐日使用此前已发布的 USDA 报告；同日发布不用。报告自发布日起最多持有 7 天，观测日期另列；不使用未来报告，不作插值或日历补缺。",
    bands:"进度是累计已达到的比例；差分只表示相邻里程碑之间的近似范围，不等于当前授粉比例。吐丝至成熟之前是宽泛的生殖 / 灌浆区间。",
    details:"各州进度、时间对齐与来源（可横向滚动）",region:"州 / 全国产量份额",progress:"最后天气日可用的累计进度",alignment:"逐日进度匹配",screen:"筛查 / 州内阶段代理范围",no:"未知 / 资料不足",yes:"命中",not:"未命中",days:"天",raw:"每日证据与输入版本",prior:"旧方法对照（Phase 3 / 4A，结果保留）",pending:"本发布尚未生成新方法结果；下方是明确标识的旧方法，不代表已完成空间交集。"},
  en:{title:"Stage-weather screening exposure · Phase 4B-1",method:"Spatial method: state-level representative screening (Level A)",
    boundary:"State progress and a single NASA grid point match only by state identity, NOT an observed crop-weather intersection. This is not affected acreage, damaged production or a yield-loss forecast.",
    production:"Known national production weights",stage:"Stage-data coverage",weather:"Weather-data coverage",joint:"State/time jointly aligned input coverage",
    missing:"Jointly uncovered share",points:"Available weather samples",exposure:"Stage-weather screening exposure (national production-equivalent range)",heat:"Existing heat screen",moisture:"Existing moisture screen",
    allocation:"A time-average proxy applying cumulative acreage progress to production weights, assuming equal yield across stages within a state and a state association with its point screen. The cached progress acreage universe is not verified as grain-only; weights are grain production. Not measured intersection, probability or statistical confidence. Missing shares are neither zero-filled nor normalized.",
    hold:"For each day use a previously published USDA report; exclude same-day publications. Hold at most 7 days since publication, with observation date shown separately; no future reports, interpolation or calendar imputation.",
    bands:"Progress is cumulative attainment. Differences approximate milestone brackets, not current pollination occupancy. Silking to before maturity is a broad reproductive / grain-fill bracket.",
    details:"State progress, temporal alignment & sources (scroll horizontally)",region:"State / national production share",progress:"Cumulative progress available for last weather day",alignment:"Daily stage alignment",screen:"Screen / within-state stage proxy range",no:"Unknown / insufficient evidence",yes:"Triggered",not:"Not triggered",days:"days",raw:"Daily evidence & input versions",prior:"Legacy comparison (Phase 3 / 4A, preserved results)",pending:"This release has no new-method artifact yet. The explicitly labelled legacy results below do not establish spatial intersection."}
};
export function CornAlignmentView({artifact:a,lang="zh"}) {
  const t=text[lang],stage=k=>STAGES[k]?.[lang==="zh"?0:1]??k,flag=v=>v===true?t.yes:v===false?t.not:t.no;
  return <section aria-label={t.title} className="corn-alignment"><h4>{t.title}</h4><p>{t.method}</p><p className="fs-notice">{t.boundary}</p>
    {!a?<p>{t.pending}</p>:<>
      <p>{a.period.start} – {a.period.end} (UTC) · {a.methodVersion}</p>
      <div className="fs-two"><div><p>{t.production}: {pct(a.coverage?.production)}</p><p>{t.stage}: {pct(a.coverage?.stage)}</p><p>{t.weather}: {pct(a.coverage?.weather)}</p></div>
        <div><p>{t.joint}: {pct(a.coverage?.joint)}</p><p>{t.missing}: {pct(a.coverage?.missingJoint)}</p><p>{t.points}: {a.sampleCount} / 10</p></div></div>
      <h5>{t.exposure}</h5><p>{t.heat}: {range(a.exposure.heat)} · {t.moisture}: {range(a.exposure.moisture)}</p>
      <p>{t.allocation}</p><p>{t.hold}</p><p>{t.bands}</p>
      <details className="fs-details"><summary>{t.details}</summary><div className="fs-calendar-scroll" role="region" tabIndex="0" aria-label={t.details}><table className="fs-calendar"><thead><tr><th>{t.region}</th><th>{t.progress}</th><th>{t.alignment}</th><th>{t.screen}</th></tr></thead><tbody>
        {a.regions.map(r=>{const d=r.daily.at(-1);return <tr key={r.id}><th scope="row">{r.name[lang]}<p>{pct(r.productionWeight)}</p><small>{r.id} · {r.point.lat}, {r.point.lon}</small></th>
          <td>{d.stage?<>{Object.entries(d.stage.cumulative).map(([k,v])=><p key={k}>{stage(k)}: {v}%</p>)}<p>{stage("silking")} → {stage("mature")}: {range(d.stage.relevant)}</p><small>{d.edition?.weekEnding} / {d.edition?.publishedDate}</small>{d.edition&&<p><a href={d.edition.downloadUrl??d.edition.sourceUrl} target="_blank" rel="noreferrer">{lang==="zh"?"报告来源":"Report source"}</a></p>}</>:t.no}</td>
          <td>{r.daily.filter(x=>x.status==="aligned-held-observation").length} / 7 {t.days}<p>{r.joint?t.joint:t.no}</p><details><summary>{t.raw}</summary><pre style={{maxWidth:"100%",overflowX:"auto"}}>{JSON.stringify({daily:r.daily,weather:r.weather,inputVersions:r.inputVersions,reasons:r.reasons},null,2)}</pre></details></td>
          <td>{t.heat}: {flag(r.screen.heat)}<p>{range(r.exposure.heat)}</p>{t.moisture}: {flag(r.screen.moisture)}<p>{range(r.exposure.moisture)}</p></td></tr>;})}
      </tbody></table></div><p>{a.weightMethod} · {a.weightYear??"—"}</p><p>{a.samplingVersion}</p><pre style={{maxWidth:"100%",overflowX:"auto"}}>{JSON.stringify({provenance:a.provenance,productionVersion:a.productionVersion,progressEditions:a.progressEditions},null,2)}</pre></details>
    </>}<h4>{t.prior}</h4>
  </section>;
}

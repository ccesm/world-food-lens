import React, {useState} from "react";
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine} from "recharts";
import "../climate.css";

const SOURCE_URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/";
const ADVISORY_URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml";

const copy = {
  zh: {
    title: "气候信号：先看海洋，再看产区",
    intro: "接入 NOAA 的相对海洋尼诺指数 RONI。它记录赤道太平洋的海温异常，是理解全球气候背景的一条线索，并不是粮食产量预测。",
    observed: "最新已发布观测 · 三个月平均", window: "观测窗口", provisional: "近期估计值，仍可能修订",
    positive: "正海温异常", negative: "负海温异常", zero: "接近基准值",
    history: "RONI 历史观测", threeYears: "近 3 年", tenYears: "近 10 年", raw: "查看观测数值",
    period: "季节", range: "覆盖月份", value: "相对海温异常", missing: "缺测",
    chartHelp: "相邻点的三个月窗口相互重叠；虚线为 ±0.5°C 参考线，不代表本站判定的厄尔尼诺或拉尼娜状态。",
    methodology: "RONI 使用 ERSSTv6 海温资料：Niño 3.4 区域的三个月平均异常，扣除热带平均异常并调整方差；基准期为 1991–2020。NOAA 自 2026 年 2 月起使用 RONI 进行官方 ENSO 监测。",
    limitation: "海温指标不等于当地天气，更不等于减产或涨价。ENSO 状态还需要大气等证据；请以 NOAA 官方诊断和当地气象、作物报告为准。",
    delay: "NOAA 通常按月更新；最近数据在首次发布后的两个月内仍可能调整。这里展示定时下载的官方观测缓存，不是实时气象，也未自动导入未来预测。",
    downloaded: "最近成功下载", attempted: "最近尝试", unavailable: "尚无可用的官方气候观测。不会用模拟值代替；可先查看下方 NOAA 官方页面。",
    cached: "下载失败，保留上次成功数据。观测期和成功下载时间未被改写。", cachedTitle: "缓存保留",
    source: "NOAA 数据与方法", advisory: "NOAA 官方 ENSO 诊断", pathwaysTitle: "把气候信号变成检查清单",
    pathways: [
      ["南美 · 大豆与玉米", "结合具体产区、播种及开花期的降雨、土壤水分和作物报告核对；一个海温指数不能概括巴西与阿根廷的所有产区。"],
      ["南亚、东南亚 · 稻米与油脂", "关注季风、灌溉水源和高温出现的时段；气候背景相似，并不意味着各国收成会同方向变化。"],
      ["北美、澳大利亚 · 小麦与玉米", "对照当地降水、极端温度和关键生育期；再结合库存和贸易判断缓冲能力，不由 RONI 直接推断价格。"],
    ],
  },
  en: {
    title: "Climate signals: from ocean to growing regions",
    intro: "NOAA’s Relative Oceanic Niño Index (RONI) tracks equatorial Pacific sea-surface temperature anomalies. It is one clue about the global climate backdrop, not a crop-production forecast.",
    observed: "Latest published observation · 3-month mean", window: "Observation window", provisional: "Recent estimate; subject to revision",
    positive: "Positive temperature anomaly", negative: "Negative temperature anomaly", zero: "Near the baseline",
    history: "Observed RONI history", threeYears: "3 years", tenYears: "10 years", raw: "View observed values",
    period: "Season", range: "Covered months", value: "Relative SST anomaly", missing: "Missing",
    chartHelp: "Each point covers three overlapping months. Dashed ±0.5°C guides are reference levels, not an El Niño or La Niña declaration by this dashboard.",
    methodology: "RONI uses ERSSTv6: a 3-month Niño 3.4 anomaly adjusted for tropical-mean anomalies and scaled variance, with a 1991–2020 baseline. NOAA adopted RONI for official ENSO monitoring in February 2026.",
    limitation: "An ocean index is not local weather, yield loss or a price forecast. Atmospheric evidence also matters for ENSO status. Consult NOAA’s official diagnosis and local weather and crop reports.",
    delay: "NOAA updates monthly; recent values may change for two months after initial publication. These are scheduled downloads of official observations, not live weather or automatically imported forecasts.",
    downloaded: "Last successful download", attempted: "Last attempt", unavailable: "No official climate observations are available yet. No simulated values are substituted; consult the NOAA pages below.",
    cached: "Download failed; the last successful data are retained with their original observation period and download time.", cachedTitle: "Retained cache",
    source: "NOAA data & methodology", advisory: "Official NOAA ENSO diagnosis", pathwaysTitle: "Turn the signal into a regional checklist",
    pathways: [
      ["South America · Soybeans & corn", "Check rainfall, soil moisture and crop reports for each growing region and planting or flowering window. One ocean index cannot represent all of Brazil and Argentina."],
      ["South & Southeast Asia · Rice & oils", "Check monsoon timing, irrigation water and heat exposure. A similar climate backdrop does not imply the same harvest outcome in every country."],
      ["North America & Australia · Wheat & corn", "Compare local rain, extreme temperatures and crop stages, then consider stocks and trade buffers. Do not infer prices directly from RONI."],
    ],
  },
};

function timestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default function ClimateMonitor({record, lang = "zh",sectionId="climate"}) {
  const t = copy[lang] || copy.zh;
  const [months, setMonths] = useState(36);
  const latest = record?.data?.latest;
  const history = Array.isArray(record?.data?.history) ? record.data.history.slice(-months) : [];
  const hasData = latest && Number.isFinite(latest.value) && history.length > 0;
  const direction = hasData ? (latest.value > 0 ? "positive" : latest.value < 0 ? "negative" : "zero") : "zero";

  return <section id={sectionId} className="section climate-section">
    <div className="section-no">CLIMATE MONITOR · NOAA</div>
    <h2>{t.title}</h2><p>{t.intro}</p>
    {record?.status === "error" && hasData && <p role="status" className="climate-warning"><b>{t.cachedTitle} · </b>{t.cached}</p>}
    {!hasData ? <div className="pending-box" role="status"><p>{t.unavailable}</p></div> : <>
      <div className="climate-grid">
        <article className={`climate-reading climate-${direction}`}>
          <span>{t.observed}</span>
          <div className="climate-number">{latest.value > 0 ? "+" : ""}{latest.value.toFixed(2)}<small>°C</small></div>
          <b>{direction === "positive" ? t.positive : direction === "negative" ? t.negative : t.zero}</b>
          <dl><dt>{t.window}</dt><dd>{latest.startMonth} → {latest.endMonth}</dd></dl>
          <span>{latest.period} · RONI</span>
          {latest.provisional && <em>{t.provisional}</em>}
        </article>
        <div className="climate-history">
          <div className="climate-chart-heading"><h3>{t.history}</h3><div className="climate-range" aria-label={t.history}>
            <button type="button" aria-pressed={months === 36} onClick={() => setMonths(36)}>{t.threeYears}</button>
            <button type="button" aria-pressed={months === 120} onClick={() => setMonths(120)}>{t.tenYears}</button>
          </div></div>
          <div className="climate-chart" role="img" aria-label={`${t.history}, ${history[0]?.period} – ${latest.period}. ${t.raw}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{top: 12, right: 14, bottom: 8, left: -20}} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e6df" />
                <XAxis dataKey="period" tick={{fontSize: 10}} minTickGap={45} />
                <YAxis tick={{fontSize: 10}} domain={[min => Math.min(-1, Math.floor(min)), max => Math.max(1, Math.ceil(max))]} unit="°" />
                <Tooltip formatter={value => [`${Number(value).toFixed(2)} °C`, "RONI"]} />
                <ReferenceLine y={0} stroke="#869b8b" />
                <ReferenceLine y={0.5} stroke="#b47859" strokeDasharray="5 4" />
                <ReferenceLine y={-0.5} stroke="#648caa" strokeDasharray="5 4" />
                <Line type="linear" dataKey="value" stroke="#315d48" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="climate-chart-note">{t.chartHelp}</p>
        </div>
      </div>
      <details className="climate-raw"><summary>{t.raw}</summary><div className="climate-table-scroll"><table>
        <thead><tr><th>{t.period}</th><th>{t.range}</th><th>{t.value} (°C)</th></tr></thead>
        <tbody>{history.slice().reverse().map(point => <tr key={point.period}><th scope="row">{point.period}</th><td>{point.startMonth} → {point.endMonth}</td><td>{Number.isFinite(point.value) ? point.value.toFixed(2) : t.missing}{point.provisional && Number.isFinite(point.value) ? " *" : ""}</td></tr>)}</tbody>
      </table></div><p>* {t.provisional}</p></details>
    </>}
    <div className="climate-meta">
      <p>{t.methodology}</p><p>{t.delay}</p>
      <div className="climate-timestamps"><span>{t.downloaded}: {timestamp(record?.fetchedAt)}</span><span>{t.attempted}: {timestamp(record?.lastAttemptAt)}</span></div>
      <div className="climate-links"><a href={record?.source?.url || SOURCE_URL} target="_blank" rel="noopener noreferrer">{t.source} ↗</a><a href={record?.data?.advisoryUrl || ADVISORY_URL} target="_blank" rel="noopener noreferrer">{t.advisory} ↗</a></div>
    </div>
    <div className="climate-caution">{t.limitation}</div>
    <h3 className="climate-pathways-title">{t.pathwaysTitle}</h3>
    <div className="climate-pathways">{t.pathways.map(([title, body]) => <article key={title}><h4>{title}</h4><p>{body}</p></article>)}</div>
  </section>;
}

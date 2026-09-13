import React from "react";
import {sourceStateLabel} from "../services/officialSources.js";
import "../food-system.css";

const copy={
  zh:{title:"全球粮食压力监测",intro:"地区冲击何时可能传导到全球？先检查收成、库存、贸易和成本是否共同承压，再看市场是否确认。这里展示可追溯的实验筛查，不把天气事件等同于减产。",
    total:"综合压力评分",missing:"证据不足 · 暂不评分",coverage:"可计分证据权重",known:"已知因子贡献",knownNote:"不是综合风险分，也不是发生概率",notice:"这是一项分析性预警工具，不是对饥荒、粮食短缺或未来资产价格的预测。权重尚未经历史危机样本验证，不声称与 1972 年存在量化相似性。",
    factor:"查看七项因子与证据",weight:"权重",score:"标准化分",contribution:"加权贡献",unknown:"未接通足够观测",confidence:"解读置信度：中 · 代理指标",date:"观测期",fetch:"成功下载",source:"来源",raw:"原始指标",rule:"规则", unavailableReason:"需要地区级作物天气、可比的进口采购记录或当前有效的贸易/运输状态。季节日历、RONI 和历史政策条目不能替代这些证据。",
    factors:{crop:"多产区作物压力",stocks:"谷物库存缓冲",imports:"进口需求冲击",energy:"能源与化肥成本",trade:"贸易限制与物流",prices:"食品价格水平确认",synchronization:"关键窗口同步受压"},
    stocksRaw:"小麦 / 玉米 / 稻米库存消费比",energyRaw:"Brent / 尿素 / DAP / 钾肥",priceRaw:"FAO 名义粮食价格指数",
    stocksRule:"三种谷物分别计算当前库存消费比在此前年度中的百分位；压力 = 100 − 百分位，再等权平均。不是总谷物指标。",
    energyRule:"四项名义价格分别与此前最多 120 个月比较，取价格水平百分位的等权平均。不是冲突强度，也不表示成本都在上涨。Brent 使用 World Bank，与价格模块中的 EIA 基准可能不同。",
    pricesRule:"FAO 当前名义指数在此前最多 120 个月的价格水平百分位。不是期货突破指标，不代表物理短缺已确认。",
    method:"方法、缺失值与时间限制",methodText:"综合公式为 Σ(因子分 × 权重)。仅当全部七项都有合格证据才显示总分；不把缺失记为 0，也不按现有因子重新放大到 100 分。百分位采用此前观测的中秩法，相同数值计半；价格至少需 36 个对比月份，库存至少需 10 个对比年度。",
    freshness:"刷新失败、超过 72 小时未检查或发布期超过 100 天的来源不参与当前计分，但原始缓存仍可查看。月度价格与年度供需频率不同，不能当作同一天的实时观测。名义价格未去除通胀，历史值含修订和预测。",
    bounds:"仅由缺失值造成的数学范围",boundsNote:"把未知因子分别设为 0 和 100 得到；不是置信区间，不预测结果。",
    levels:"分级规则（仅适用于完整证据）：≤20 低，>20–40 中等，>40–60 偏高，>60–80 高，>80 严重。",
    early:"早期信号与官方确认",earlyLead:"信息到达有先后，分歧需要同地区、同作物、同时间的证据核对。官方预测更新较慢并不意味着故意隐瞒。",
    earlyTitle:"早期信号 · 部分接入",earlyText:"作物窗口已有 NASA 代表点温度、降雨和模型土壤湿润度，以及 GDO 干旱背景；冠层状态、作物评级、卫星植被、灌溉与采购招标仍缺失。当前尚不能自动判断“天气恶化但官方预测稳定”的分歧。",
    officialTitle:"官方确认 · 已有部分数据",officialText:"已接通 USDA 年度供需、FAO 月度指数、World Bank 成本基准和 NOAA 海温背景。并非地区级收成确认；库存与贸易可用性还需要更多核验。",
  },
  en:{title:"Global Food Stress Monitor",intro:"When can a regional shock spread globally? Check whether harvests, stocks, trade and costs reinforce one another, then look for market confirmation. This transparent experimental screen does not equate bad weather with crop failure.",
    total:"Overall stress score",missing:"Insufficient evidence · not scored",coverage:"Scorable evidence weight",known:"Known-factor contribution",knownNote:"Not a total risk score or probability",notice:"This indicator is an analytical early-warning tool. It is not a prediction of famine, food shortages, or future asset prices. Weights are not validated against crisis episodes; no quantified similarity to 1972 is claimed.",
    factor:"Inspect seven factors and their evidence",weight:"Weight",score:"Normalized score",contribution:"Contribution",unknown:"Insufficient connected observations",confidence:"Interpretive confidence: medium · proxy",date:"Observation",fetch:"Successful fetch",source:"Source",raw:"Raw indicator",rule:"Rule",unavailableReason:"Requires regional crop/weather observations, comparable importer purchases, or currently verified trade/logistics status. Seasonal calendars, RONI and historical policy records cannot replace this evidence.",
    factors:{crop:"Multi-region crop stress",stocks:"Grain inventory buffer",imports:"Importer demand shock",energy:"Energy and fertilizer costs",trade:"Trade restrictions / logistics",prices:"Food price-level confirmation",synchronization:"Critical-window synchronization"},
    stocksRaw:"Wheat / maize / rice stocks-to-use",energyRaw:"Brent / urea / DAP / potash",priceRaw:"FAO nominal Food Price Index",
    stocksRule:"Calculate each grain’s current stocks/use percentile against prior years. Stress = 100 − percentile, averaged equally across three grains. Not a total-cereal measure.",
    energyRule:"Average four nominal price-level percentiles against up to 120 prior months. Not conflict intensity or a claim that all costs are rising. Uses World Bank Brent, which can differ from the price module’s EIA benchmark.",
    pricesRule:"Current nominal FAO index percentile against up to 120 prior months. Not a futures breakout or confirmation of physical shortage.",
    method:"Method, missingness and timing",methodText:"Total = Σ(factor score × weight). Show it only when all seven factors have eligible evidence. Missing is not zero and available factors are not rescaled to 100. Percentiles use midranks against prior observations, counting ties as half; minimum comparison samples are 36 price months and 10 inventory years.",
    freshness:"Failed refreshes, sources unchecked for over 72 hours or releases older than 100 days are excluded from current scoring; retained observations remain accessible. Monthly prices and annual supply estimates are not same-day live measurements. Nominal prices are not inflation-adjusted; historical data include revisions and forecasts.",
    bounds:"Mathematical bounds due only to missing factors",boundsNote:"Unknown factors set to 0 or 100; not a confidence interval or an outcome forecast.",
    levels:"Levels (complete evidence only): ≤20 Low; >20–40 Moderate; >40–60 Elevated; >60–80 High; >80 Critical.",
    early:"Official Data vs Early Signals",earlyLead:"Evidence arrives at different times. Compare the same crop, region and period before interpreting divergence. Slower official revisions do not imply deliberate concealment.",
    earlyTitle:"Early signals · partly connected",earlyText:"Crop windows now include NASA point temperatures, rainfall and modelled soil wetness plus GDO drought context. Canopy condition, crop ratings, satellite vegetation, irrigation and purchase tenders remain missing. Automated detection of deteriorating weather versus stable official production is not yet available.",
    officialTitle:"Official confirmation · partly connected",officialText:"USDA annual balances, FAO monthly prices, World Bank costs and NOAA ocean context are connected. These are not regional harvest confirmation; inventories and tradable availability still require verification.",
  },
};
const number=x=>Number.isFinite(x)?x.toFixed(1):"—";

export default function GlobalFoodStress({bundle,lang,model}) {
  const t=copy[lang];
  const comparison=(signal)=>signal?`${signal.referenceStart}–${signal.referenceEnd} · n=${signal.count}`:"—";
  const metadata={
    stocks:{record:bundle.sources.usda,raw:t.stocksRaw,value:["wheat","maize","rice"].map(key=>`${number(model.inventories[key]?.current.ratio)}%`).join(" / "),period:model.inventories.wheat?.current.year,rule:t.stocksRule},
    energy:{record:bundle.sources.worldBank,raw:t.energyRaw,value:["brent","urea","dap","potash"].map(key=>number(model.costs[key]?.value)).join(" / "),period:model.costs.brent?.period,rule:t.energyRule},
    prices:{record:bundle.sources.fao,raw:t.priceRaw,value:number(model.prices?.value),period:model.prices?.period,rule:t.pricesRule},
  };
  return <section id="food-stress" className="section food-system">
    <div className="section-no">FOOD SYSTEM / EVIDENCE FIRST</div><h2>{t.title}</h2><p>{t.intro}</p>
    <div className="fs-summary">
      <article className="fs-card"><span>{t.total}</span><strong className="fs-unavailable">{model.score===null?"—":number(model.score)}</strong><b>{model.score===null?t.missing:model.level}</b></article>
      <article className="fs-card"><span>{t.coverage}</span><strong>{model.coverage}%</strong><meter min="0" max="100" value={model.coverage} aria-label={t.coverage}/><small>{model.rows.filter(row=>row.score!==null).length} / 7</small></article>
      <article className="fs-card"><span>{t.known}</span><strong>{number(model.known)} <small>/ {model.coverage}</small></strong><small>{t.knownNote}</small></article>
    </div>
    <p className="fs-notice">{t.notice}</p>
    <p><a href="#enso-outlook">{lang==="zh"?"查看 ENSO 和季节气候展望（尚不参与综合计分） ↗":"Explore ENSO and seasonal outlook (not included in the total score) ↗"}</a></p>
    <details className="fs-details"><summary>{t.factor}</summary><div className="fs-factor-grid">
      {model.rows.map(row=>{const meta=metadata[row.id];return <article className="fs-card" key={row.id}>
        <div className="fs-factor-head"><h3>{t.factors[row.id]}</h3><span>{row.weight}% {t.weight}</span></div>
        <p className="fs-calculation">{number(row.score)} × {row.weight}% = {number(row.contribution)}</p>
        <small>{t.score} × {t.weight} = {t.contribution}</small>
        {meta?<><p><b>{t.raw}:</b> {meta.raw}<br/>{meta.value}{row.id==="energy"?<small> · USD/bbl; USD/mt × 3</small>:null}</p><p>{meta.rule}</p><small>{row.score===null?t.unknown:t.confidence}</small>
          {row.id==="energy"&&<details><summary>{lang==="zh"?"价格水平与同比变化":"Price levels versus year-on-year changes"}</summary>{Object.entries(model.costs).map(([key,signal])=><p key={key}>{({brent:"Brent",urea:lang==="zh"?"尿素":"Urea",dap:"DAP",potash:lang==="zh"?"氯化钾":"Potash"})[key]}: {number(signal?.score)} / 100 · {lang==="zh"?"同比":"YoY"} {number(signal?.yoy)}%<br/>{comparison(signal)}</p>)}</details>}
          {row.id==="prices"&&<small>{comparison(model.prices)} · {lang==="zh"?"同比":"YoY"} {number(model.prices?.yoy)}%</small>}
          <div className="fs-provenance"><a href={meta.record?.source?.url} target="_blank" rel="noreferrer">{meta.record?.source?.label} ↗</a><span>{t.date}: {meta.period??"—"}</span><span>{t.fetch}: {meta.record?.fetchedAt??"—"}</span><span>{sourceStateLabel(meta.record,lang)}</span></div>
        </>:<><b className="fs-muted">{t.unknown}</b><p>{t.unavailableReason}</p></>}
      </article>})}
    </div></details>
    <details className="fs-details"><summary>{t.method}</summary><p>{t.methodText}</p><p>{t.freshness}</p><p>{t.levels}</p><p>{t.bounds}: {number(model.bounds[0])}–{number(model.bounds[1])}. {t.boundsNote}</p></details>
    <details className="fs-details"><summary>{t.early}</summary><p>{t.earlyLead}</p><div className="fs-two"><article><h3>{t.earlyTitle}</h3><p>{t.earlyText}</p></article><article><h3>{t.officialTitle}</h3><p>{t.officialText}</p></article></div></details>
  </section>;
}

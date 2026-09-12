import React, {useMemo, useState} from "react";
import registry from "../data/policyEvents.json";
import {filterPolicyEvents, policyCommodities, policyCountries, policyTypes} from "../services/policyEvents.js";
import "../policy.css";

const copy = {
  zh: {
    title: "政策与冲突，怎样改变粮食流动？",
    intro: "可检索的历史事件库：出口限制、进口减税，以及战争中的粮食运输通道。每条记录都保留官方出处。",
    notice: "这是人工整理、随 Git 保存的精选历史记录，覆盖不完整；并非 FAPDA 自动同步或实时政策清单。核对的是历史来源，不代表已核实现行法律状态。",
    reviewed: "历史来源人工核对日期（UTC）", search: "搜索中英文关键词", placeholder: "例如：大米、India、黑海",
    country: "国家 / 地区", type: "事件类型", commodity: "商品", all: "全部", reset: "清除筛选",
    results: "条匹配记录", total: "条精选记录", empty: "没有匹配记录。试试其他关键词，或清除筛选。",
    date: "事件 / 报告日期", published: "来源发布日期", effective: "当时生效日期", checked: "历史来源核对",
    historical: "历史事件 · 非现行状态", unverified: "现行状态未复核",
    interpretation: "可能的传导路径 · 本站解读，非因果估计",
    source: "查看官方来源", more: "FAO FAPDA 官方政策检索（外部站点）",
    footer: "事件不等于已证实的价格影响；请按具体时期、豁免和执行情况阅读原文。此处不构成法律或投资建议。",
  },
  en: {
    title: "How do policy and conflict reshape food flows?",
    intro: "Search historical export restrictions, import tariff relief and wartime food corridors, with an official citation for every record.",
    notice: "This is a curated historical registry stored in Git with non-exhaustive coverage, not automatic FAPDA synchronization or a live policy inventory. Review verifies historical sources, not present legal status.",
    reviewed: "Historical sources reviewed (UTC)", search: "Search English or Chinese", placeholder: "For example: rice, India, Black Sea",
    country: "Country / region", type: "Event type", commodity: "Commodity", all: "All", reset: "Clear filters",
    results: "matching records", total: "curated records", empty: "No matching records. Try another keyword or clear the filters.",
    date: "Event / report date", published: "Source publication", effective: "Effective date at the time", checked: "Historical source reviewed",
    historical: "Historical event · not current status", unverified: "Current status not reverified",
    interpretation: "Possible transmission · our interpretation, not a causal estimate",
    source: "Read official source", more: "FAO FAPDA policy search (external website)",
    footer: "Events are not proven price effects. Read the source for timing, exemptions and implementation. Not legal or investment advice.",
  },
};

export default function PolicyEvents({lang = "zh"}) {
  const locale = lang === "en" ? "en" : "zh";
  const t = copy[locale];
  const [filters, setFilters] = useState({query: "", country: "", type: "", commodity: ""});
  const results = useMemo(() => filterPolicyEvents(registry.events, filters), [filters]);
  const update = key => event => setFilters(current => ({...current, [key]: event.target.value}));
  const clear = () => setFilters({query: "", country: "", type: "", commodity: ""});

  return <section id="s3" className="section policy-section" aria-labelledby="policy-heading">
    <div className="section-no">POLICY &amp; CONFLICT · HISTORICAL REGISTRY</div>
    <h2 id="policy-heading">{t.title}</h2>
    <p>{t.intro}</p>
    <div className="policy-disclosure"><p>{t.notice}</p><small>{t.reviewed}: <time dateTime={registry.reviewedAt}>{registry.reviewedAt}</time> · {registry.events.length} {t.total}</small></div>
    <form className="policy-filters" role="search" aria-label={t.search} onSubmit={event => event.preventDefault()}>
      <label className="policy-search">{t.search}<input type="search" value={filters.query} onChange={update("query")} placeholder={t.placeholder}/></label>
      {[["country", policyCountries], ["type", policyTypes], ["commodity", policyCommodities]].map(([key, options]) => <label key={key}>{t[key]}
        <select value={filters[key]} onChange={update(key)}><option value="">{t.all}</option>{Object.entries(options).map(([id, label]) => <option key={id} value={id}>{label[locale]}</option>)}</select>
      </label>)}
      <button type="button" onClick={clear}>{t.reset}</button>
    </form>
    <p className="policy-count" role="status" aria-live="polite" aria-atomic="true">{results.length} {t.results}</p>
    {results.length === 0 ? <div className="policy-empty"><p>{t.empty}</p><button type="button" onClick={clear}>{t.reset}</button></div> : <div className="policy-records">
      {results.map(event => <article className="policy-record" key={event.id} aria-labelledby={`policy-${event.id}`}>
        <div className="policy-record-meta"><span>{policyCountries[event.country][locale]}</span><span>{policyTypes[event.type][locale]}</span><span className="policy-record-status">{event.legalStatus === "historical" ? t.historical : t.unverified}</span></div>
        <h3 id={`policy-${event.id}`}>{event.title[locale]}</h3>
        <dl className="policy-dates"><div><dt>{t.date}</dt><dd><time dateTime={event.eventDate}>{event.eventDate}</time></dd></div><div><dt>{t.published}</dt><dd><time dateTime={event.publishedAt}>{event.publishedAt}</time></dd></div>{event.effectiveDate && <div><dt>{t.effective}</dt><dd><time dateTime={event.effectiveDate}>{event.effectiveDate}</time></dd></div>}</dl>
        <p>{event.summary[locale]}</p>
        <div className="policy-tags">{event.commodities.map(commodity => <span key={commodity}>{policyCommodities[commodity][locale]}</span>)}</div>
        <details className="policy-interpretation"><summary>{t.interpretation}</summary><p>{event.transmission[locale]}</p></details>
        <div className="policy-source"><a href={event.source.url} target="_blank" rel="noopener noreferrer">{t.source} ↗ <span>{event.source.publisher} · {event.source.title}</span></a><small>{t.checked}: <time dateTime={event.verifiedAt}>{event.verifiedAt}</time> UTC</small></div>
      </article>)}
    </div>}
    <p className="policy-footnote">{t.footer}</p>
    <a className="source-link" href="https://fapda.apps.fao.org/" target="_blank" rel="noopener noreferrer">{t.more} ↗</a>
  </section>;
}

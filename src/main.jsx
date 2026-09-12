import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, ReferenceLine
} from "recharts";
import snapshot from "./data/recoveredSnapshot";
import {refreshOfficialData} from "./services/officialSources";
import "./styles.css";

const copy = {
  zh:{
    badge:"全球视角 · 官方数据 · 清晰解读",
    hero:"看懂粮价背后的变化。",
    intro:"从油价与化肥，到全球收成和贸易政策。把分散的信号，放到一起观察。",
    sync:"迁移版 · 当前显示旧站恢复缓存",
    dataSources:"数据来源", check:"检查更新", english:"Switch to English",
    nav:["价格与成本","产量与库存","全球政策库","如何影响粮价","成本实验室","投资标的"],
    priceTitle:"粮价与能源，是否同向变化？", recovered:"旧站恢复快照",
    normalized:"共同起点 = 100", raw:"查看恢复的月度数据",
    fertilizerTitle:"化肥：农场的成本信号", agriTitle:"农产品：国际贸易基准",
    crop:"作物", monthly:"月均价", change:"环比变化",
    usdaTitle:"收成能否跟上消耗？", ratio:"全球小麦库存消费比",
    ratioHelp:"期末库存 ÷ 年度国内消费 × 100%。它表示库存相对于消耗的缓冲规模；下降可能意味着缓冲减弱，但不是价格上涨的保证。",
    policyTitle:"全球政策库", keyword:"关键词（原文）", country:"国家 / 地区", type:"政策类型",
    policyPending:"旧站的 FAPDA 搜索/同步后端无法从 Site projection 直接导出。这里保留界面与接入位置，下一步重新连接官方 FAPDA。",
    dots:"三条线索，读懂价格传导",
    energy:"能源 → 农业成本", energyText:"原油影响农机燃油、运输和加工；天然气是氮肥的重要原料。油价和化肥价格可能同涨，但不是简单的一对一关系。",
    stocks:"收成与库存 → 缓冲能力", stocksText:"当消费高于产量时，库存可能提供缓冲。库存较低时，天气和供应冲击更容易引起价格变化。",
    policy:"政策 → 可贸易供应", policyText:"出口限制可能压低出口国内价格，却推高进口市场压力；减免进口税可能降低本地成本。",
    causality:"观察关联，不冒充因果估计",
    causalityText:"本工具不把时间上的先后或同时上涨解读为已证实的政策效果，也不提供未经验证的粮价涨跌预测。",
    lab:"如果投入成本改变了呢？", labHelp:"假设燃料占 20%、化肥占 30%、其他投入占 50%，观察加权总成本变化。不是粮价预测。",
    fuel:"燃料成本变化", fert:"化肥成本变化", other:"其他投入成本变化", total:"假设总成本变化", reset:"重置",
    invest:"美国市场可投资标的", investHelp:"标的说明由 World Food Lens 整理；交互式价格图表由 TradingView 提供。点击标的可查看日内或长期走势，无需连接个人券商账户。",
    exposure:"农业暴露", whyItMatters:"为何关注", marketChart:"市场价格图表",
    marketNotice:"行情与图表由 TradingView 提供，可能依据交易所及数据供应商规则延迟；不构成投资建议。",
    viewOnTradingView:"在 TradingView 查看", chartUnavailable:"图表暂时无法加载，请使用下方链接查看。",
    desk:"每个数字，都能追溯来源", deskHelp:"以下时间来自旧站最后一次可恢复的数据快照，并不代表当前实时抓取。",
    observation:"观测期 / 市场年度", last:"旧站最近成功抓取", status:"状态",
    footer:"帮助理解全球粮食系统 · 非投资建议或法律意见",
    updateUnavailable:"本地 Git 迁移版尚未配置实时数据适配器；当前仍显示旧站恢复缓存。"
  },
  en:{
    badge:"Global view · Official data · Clear interpretation",
    hero:"See what is moving food prices.",
    intro:"From oil and fertilizer to harvests, inventories and trade policy—bring scattered signals into one view.",
    sync:"Git migration · showing recovered hosted-site cache",
    dataSources:"Data sources", check:"Check updates", english:"中文",
    nav:["Prices & costs","Supply & stocks","Global policy","How it transmits","Cost lab","Investments"],
    priceTitle:"Do food and energy prices move together?", recovered:"Recovered hosted-site snapshot",
    normalized:"Common starting point = 100", raw:"View recovered monthly data",
    fertilizerTitle:"Fertilizer: the farm-cost signal", agriTitle:"Agriculture: international benchmarks",
    crop:"Commodity", monthly:"Monthly avg.", change:"MoM",
    usdaTitle:"Can harvests keep up with use?", ratio:"Global wheat stock-to-use ratio",
    ratioHelp:"Ending stocks ÷ annual domestic consumption × 100%. It is a buffer indicator, not a guarantee of future price direction.",
    policyTitle:"Global policy database", keyword:"Keyword", country:"Country / region", type:"Policy type",
    policyPending:"The old FAPDA search/sync backend cannot be exported directly from the hosted Site projection. The interface and adapter point are preserved here for reconnection.",
    dots:"Three signals for reading price transmission",
    energy:"Energy → farm costs", energyText:"Oil affects machinery fuel, transport and processing; natural gas is a major nitrogen-fertilizer input. Co-movement is not one-to-one causality.",
    stocks:"Harvests & stocks → buffer", stocksText:"When consumption exceeds production, inventories can absorb shocks. Low buffers can increase sensitivity to weather and supply disruptions.",
    policy:"Policy → tradable supply", policyText:"Export restrictions can reduce domestic prices while increasing pressure on import markets. Effects depend on execution, markets and FX.",
    causality:"Observe relationships without pretending causality",
    causalityText:"This tool does not treat timing or simultaneous increases as proven policy effects and does not present unverified food-price forecasts.",
    lab:"What if input costs change?", labHelp:"Arithmetic experiment: fuel 20%, fertilizer 30%, other inputs 50%. This is not a food-price forecast.",
    fuel:"Fuel cost change", fert:"Fertilizer cost change", other:"Other input change", total:"Hypothetical total-cost change", reset:"Reset",
    invest:"Investable U.S. market exposure", investHelp:"World Food Lens provides the instrument explanations; TradingView provides the interactive price charts. Select an instrument to explore intraday or long-term history without connecting a brokerage account.",
    exposure:"Agricultural exposure", whyItMatters:"Why it matters", marketChart:"Market price chart",
    marketNotice:"Quotes and charts are provided by TradingView and may be delayed under exchange and data-provider rules. Not investment advice.",
    viewOnTradingView:"View on TradingView", chartUnavailable:"The chart could not be loaded. Use the link below to view it instead.",
    desk:"Every number should be traceable", deskHelp:"These timestamps are from the last recoverable hosted-site snapshot, not a current live fetch.",
    observation:"Observation / marketing year", last:"Old-site last success", status:"Status",
    footer:"Understand the global food system · Not investment or legal advice",
    updateUnavailable:"Live source adapters are not configured in this Git migration yet. Recovered hosted-site cache remains displayed."
  }
};

const investments = [
  {symbol:"DBA",name:"Invesco DB Agriculture Fund",zh:"广泛农业商品",en:"Broad agriculture",tvSymbol:"AMEX:DBA",descZh:"通过农业商品期货组合提供广泛敞口，走势还会受到期货曲线、展期和基金费用影响。",descEn:"Provides broad exposure through agricultural commodity futures; returns are also shaped by the futures curve, contract rolls and fund expenses."},
  {symbol:"CORN",name:"Teucrium Corn Fund",zh:"玉米",en:"Corn",tvSymbol:"AMEX:CORN",descZh:"主要通过不同到期月份的玉米期货表达玉米价格敞口，并不等同于现货玉米价格。",descEn:"Uses corn futures across several maturities to express corn exposure; its return is not the same as the spot price of corn."},
  {symbol:"WEAT",name:"Teucrium Wheat Fund",zh:"小麦",en:"Wheat",tvSymbol:"AMEX:WEAT",descZh:"通过小麦期货提供价格敞口，天气、出口流向和期货曲线都可能影响基金表现。",descEn:"Provides exposure through wheat futures; weather, export flows and the futures curve can all influence its performance."},
  {symbol:"SOYB",name:"Teucrium Soybean Fund",zh:"大豆",en:"Soybeans",tvSymbol:"AMEX:SOYB",descZh:"通过大豆期货连接油籽市场，表现也会受到压榨需求、贸易和展期结构影响。",descEn:"Connects to the oilseed market through soybean futures; crushing demand, trade and roll structure can also affect returns."},
  {symbol:"MOS",name:"The Mosaic Company",zh:"磷肥 / 钾肥",en:"Phosphate & potash",tvSymbol:"NYSE:MOS",descZh:"化肥生产商，其经营与磷肥、钾肥价格、原料成本、产能利用率和全球施肥需求相关。",descEn:"A fertilizer producer exposed to phosphate and potash prices, input costs, capacity utilization and global nutrient demand."},
  {symbol:"NTR",name:"Nutrien",zh:"化肥与农业零售",en:"Fertilizer & farm retail",tvSymbol:"NYSE:NTR",descZh:"业务覆盖钾肥、氮肥、磷肥和农业零售，可观察作物投入品需求与化肥周期。",descEn:"Spans potash, nitrogen, phosphate and agricultural retail, offering a view into crop-input demand and fertilizer cycles."},
  {symbol:"DE",name:"Deere & Company",zh:"农业机械",en:"Farm equipment",tvSymbol:"NYSE:DE",descZh:"农业机械和精准农业设备制造商，需求与农场收入、融资环境及设备更新周期有关。",descEn:"A farm-machinery and precision-agriculture manufacturer whose demand relates to farm income, financing conditions and replacement cycles."},
  {symbol:"ADM",name:"Archer-Daniels-Midland",zh:"粮食加工与贸易",en:"Grain processing & trade",tvSymbol:"NYSE:ADM",descZh:"连接粮食收购、运输、加工和贸易环节；利润更多取决于加工与贸易价差，而非单一粮价方向。",descEn:"Connects origination, transport, processing and trading; margins depend more on processing and merchandising spreads than one crop-price direction."},
];

function tradingViewUrl(instrument){
  return `https://www.tradingview.com/symbols/${instrument.tvSymbol.replace(":","-")}/?utm_source=world-food-lens&utm_medium=widget&utm_campaign=advanced-chart`;
}

function TradingViewChart({instrument,lang}){
  const container=useRef(null);
  const [loadFailed,setLoadFailed]=useState(false);
  const href=tradingViewUrl(instrument);

  useEffect(()=>{
    const host=container.current;
    if(!host) return;
    setLoadFailed(false);
    const script=document.createElement("script");
    script.src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type="text/javascript";
    script.async=true;
    script.onerror=()=>setLoadFailed(true);
    script.innerHTML=JSON.stringify({
      autosize:true,
      symbol:instrument.tvSymbol,
      interval:"D",
      timezone:"exchange",
      theme:"light",
      backgroundColor:"#ffffff",
      gridColor:"rgba(46, 46, 46, 0.06)",
      style:"1",
      locale:lang==="zh"?"zh_CN":"en",
      hide_side_toolbar:true,
      hide_top_toolbar:false,
      hide_legend:false,
      hide_volume:false,
      allow_symbol_change:false,
      withdateranges:true,
      save_image:false,
      calendar:false,
      support_host:"https://www.tradingview.com"
    });
    host.appendChild(script);
    return ()=>script.remove();
  },[instrument.tvSymbol,lang]);

  const t=copy[lang];
  return <div className="market-chart">
    <div className="market-chart-head"><b>{t.marketChart}</b><span>{instrument.tvSymbol}</span></div>
    {loadFailed&&<div className="chart-fallback" role="status">{t.chartUnavailable}</div>}
    <div className="tradingview-widget-container" ref={container}>
      <div className="tradingview-widget-container__widget"/>
      <div className="tradingview-widget-copyright">
        <a href={href} rel="noopener nofollow" target="_blank">{instrument.symbol} chart</a><span> by TradingView</span>
      </div>
    </div>
    <div className="market-note"><span>{t.marketNotice}</span><a href={href} rel="noopener nofollow" target="_blank">{t.viewOnTradingView} ↗</a></div>
  </div>
}

function pct(v){ return `${v>=0?"+":""}${v.toFixed(1)}%`; }
function normalize(rows,key){
  const base = rows[0][key];
  return rows.map(r=>({...r,[`${key}N`]: +(r[key]/base*100).toFixed(2)}));
}
function Kpi({label,value,change,period,unit}){
  const up = change>0;
  return <div className="kpi">
    <span>{label}</span><strong>{value}</strong>
    <b className={up?"up":"down"}>{up?"↑":"↓"} {typeof change==="number" ? (Math.abs(change)<2 && unit==="%" ? `${change>0?"+":""}${change.toFixed(1)} pp` : pct(change)) : change}</b>
    <small>{period} · {unit}</small>
    <em>{copy.zh.recovered}</em>
  </div>
}
function App(){
  const [lang,setLang]=useState("zh");
  const [range,setRange]=useState(36);
  const [rawOpen,setRawOpen]=useState(false);
  const [refreshMsg,setRefreshMsg]=useState("");
  const [fuel,setFuel]=useState(0), [fert,setFert]=useState(0), [other,setOther]=useState(0);
  const [selected,setSelected]=useState(investments[0]);
  const [policyQuery,setPolicyQuery]=useState("");
  const t=copy[lang];

  const rows=useMemo(()=>normalize(snapshot.monthly.slice(-range),"fao"),[range]);
  const chart=useMemo(()=>{
    const baseB=rows[0].brent;
    return rows.map(r=>({...r,brentN:+(r.brent/baseB*100).toFixed(2)}));
  },[rows]);
  const total=0.2*fuel+0.3*fert+0.5*other;

  async function doRefresh(){
    const r=await refreshOfficialData();
    setRefreshMsg(lang==="zh"?t.updateUnavailable:r.message);
  }

  return <div className="app">
    <header className="top">
      <div className="brand"><b>WFL</b><div><strong>World Food Lens</strong><span>全球粮食观察</span></div></div>
      <div className="actions">
        <a href="#data-desk">{t.dataSources}</a>
        <button onClick={doRefresh}>↻ {t.check}</button>
        <button onClick={()=>setLang(lang==="zh"?"en":"zh")}>{t.english}</button>
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="eyebrow">{t.badge}</div>
        <h1>{t.hero}</h1>
        <p>{t.intro}</p>
        <div className="sync">{t.sync}</div>
        {refreshMsg && <div className="notice">{refreshMsg}</div>}
      </section>

      <section className="kpis">
        <Kpi label={lang==="zh"?"FAO 粮食价格指数":"FAO Food Price Index"} value="133.3" change={1.9} period="2026-08" unit="2014–2016 = 100"/>
        <Kpi label={lang==="zh"?"Brent 原油":"Brent crude"} value="$91.08" change={8.7} period="2026-08" unit={lang==="zh"?"美元 / 桶":"USD / barrel"}/>
        <Kpi label={lang==="zh"?"尿素基准价格":"Urea benchmark"} value="$390.0" change={-2.5} period="2026-08" unit={lang==="zh"?"美元 / 公吨":"USD / mt"}/>
        <Kpi label={t.ratio} value="33.6%" change={-0.7} period="2026/2027" unit="%"/>
      </section>

      <nav className="section-nav">
        {t.nav.map((x,i)=><a key={x} href={`#s${i+1}`}>{x}</a>)}
      </nav>

      <section id="s1" className="section">
        <div className="section-no">01 / PRICE PATH</div>
        <div className="section-head">
          <div><h2>{t.priceTitle}</h2><p>{lang==="zh"?"图中序列统一换算为共同起点 = 100，便于比较变化幅度，不代表价格水平相同。共同波动不等于因果关系。":"Series are rebased to a common starting point of 100 for change comparison. Co-movement does not establish causality."}</p></div>
          <div className="select-wrap"><label>{lang==="zh"?"时间范围":"Range"}</label><select value={range} onChange={e=>setRange(+e.target.value)}><option value="12">{lang==="zh"?"近 12 个月":"12 months"}</option><option value="36">{lang==="zh"?"近 36 个月":"36 months"}</option></select></div>
        </div>
        <div className="chart-card">
          <div className="legend"><span>● FAO</span><span>● Brent</span><b>{t.normalized}</b></div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="month" minTickGap={36}/><YAxis domain={["auto","auto"]}/><Tooltip formatter={(v,n)=>[v,n==="faoN"?"FAO":"Brent"]}/>
                <ReferenceLine y={100} strokeDasharray="5 5"/>
                <Line type="monotone" dataKey="faoN" strokeWidth={2.6} dot={false}/>
                <Line type="monotone" dataKey="brentN" strokeWidth={2.2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <button className="text-btn" onClick={()=>setRawOpen(!rawOpen)}>{t.raw} {rawOpen?"▲":"▼"}</button>
          {rawOpen && <div className="raw-table"><table><thead><tr><th>Month</th><th>FAO</th><th>Brent</th></tr></thead><tbody>{rows.map(r=><tr key={r.month}><td>{r.month}</td><td>{r.fao.toFixed(2)}</td><td>${r.brent.toFixed(2)}</td></tr>)}</tbody></table></div>}
        </div>

        <div className="split">
          <TableBox kicker="WORLD BANK / FERTILIZERS" title={t.fertilizerTitle} rows={snapshot.fertilizers} lang={lang}/>
          <TableBox kicker="WORLD BANK / AGRICULTURE" title={t.agriTitle} rows={snapshot.agriculture} lang={lang}/>
        </div>
      </section>

      <section id="s2" className="section alt">
        <div className="section-no">02 / USDA • WORLD TOTAL</div>
        <h2>{t.usdaTitle}</h2>
        <div className="usda-grid">
          <div className="ratio-card"><span>{t.ratio}</span><strong>33.6%</strong><b className="down">−0.7 pp</b><small>2026/2027 · USDA PSD headline recovered from old site</small></div>
          <div className="mini-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{year:"2025/26",ratio:34.3},{year:"2026/27",ratio:33.6}]}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="year"/><YAxis domain={[30,36]}/><Tooltip/><Bar dataKey="ratio"/></BarChart></ResponsiveContainer></div>
        </div>
        <div className="explain"><b>{lang==="zh"?"库存消费比是什么？":"What is stock-to-use?"}</b><p>{t.ratioHelp}</p><small>{lang==="zh"?"迁移说明：旧站公开快照中可恢复的是最新比率头条。完整 USDA 产量/消费/库存时间序列需要重新接入 PSD。":"Migration note: only the headline ratio was recoverable from the public snapshot; full PSD production/consumption/stocks series must be reconnected."}</small></div>
      </section>

      <section id="s3" className="section">
        <div className="section-no">03 / FAO • FAPDA</div>
        <div className="section-head"><div><h2>{t.policyTitle}</h2><p>{lang==="zh"?"自动同步 FAO 整理的各国政策摘要，并保存可检索记录——此能力需要在 Git 版重新连接。":"The hosted site synchronized FAO-curated policy summaries; the Git version needs that backend reconnected."}</p></div><a className="source-link" href="https://fapda.apps.fao.org/" target="_blank" rel="noreferrer">FAPDA ↗</a></div>
        <div className="policy-tools">
          <input value={policyQuery} onChange={e=>setPolicyQuery(e.target.value)} placeholder={t.keyword}/>
          <select><option>{t.country}</option></select><select><option>{t.type}</option></select><button disabled>{lang==="zh"?"筛选":"Filter"}</button>
        </div>
        <div className="pending-box"><b>{lang==="zh"?"FAPDA 适配器待重连":"FAPDA adapter pending"}</b><p>{t.policyPending}</p>{policyQuery&&<small>{lang==="zh"?`已输入关键词：“${policyQuery}”（目前仅界面演示）`:`Keyword entered: "${policyQuery}" (UI only for now)`}</small>}</div>
      </section>

      <section id="s4" className="section alt">
        <div className="section-no">04 / CONNECT THE DOTS</div><h2>{t.dots}</h2>
        <div className="three">
          <article><i>01</i><h3>{t.energy}</h3><p>{t.energyText}</p></article>
          <article><i>02</i><h3>{t.stocks}</h3><p>{t.stocksText}</p></article>
          <article><i>03</i><h3>{t.policy}</h3><p>{t.policyText}</p></article>
        </div>
        <div className="caution"><b>{t.causality}</b><p>{t.causalityText}</p></div>
      </section>

      <section id="s5" className="section">
        <div className="section-no">05 / LEARNING LAB</div><h2>{t.lab}</h2><p>{t.labHelp}</p>
        <div className="lab">
          <Slider label={t.fuel} value={fuel} set={setFuel}/><Slider label={t.fert} value={fert} set={setFert}/><Slider label={t.other} value={other} set={setOther}/>
          <div className="formula"><span>{t.total}</span><strong>{total>=0?"+":""}{total.toFixed(1)}%</strong><code>ΔC = 0.2×ΔFuel + 0.3×ΔFertilizer + 0.5×ΔOther</code><button onClick={()=>{setFuel(0);setFert(0);setOther(0)}}>{t.reset}</button></div>
        </div>
      </section>

      <section id="s6" className="section alt">
        <div className="section-no">06 / INVESTMENT LENS</div><h2>{t.invest}</h2><p>{t.investHelp}</p>
        <div className="invest-grid">
          <div className="tickers" aria-label={t.invest}>{investments.map(x=><button aria-pressed={x.symbol===selected.symbol} className={x.symbol===selected.symbol?"active":""} key={x.symbol} onClick={()=>setSelected(x)}><b>{x.symbol}</b><span>{lang==="zh"?x.zh:x.en}</span></button>)}</div>
          <div className="security">
            <span className="big-symbol">{selected.symbol}</span><h3>{selected.name}</h3><p><b>{t.exposure}:</b> {lang==="zh"?selected.zh:selected.en}</p>
            <div className="instrument-context"><b>{t.whyItMatters}</b><p>{lang==="zh"?selected.descZh:selected.descEn}</p></div>
            <TradingViewChart key={`${selected.tvSymbol}-${lang}`} instrument={selected} lang={lang}/>
          </div>
        </div>
      </section>

      <section id="data-desk" className="section">
        <div className="section-no">DATA DESK</div><h2>{t.desk}</h2><p>{t.deskHelp}</p>
        <div className="desk">{snapshot.dataDesk.map(x=><div className="desk-row" key={x.source}><b>{x.source}</b><span><small>{t.observation}</small>{x.period}</span><span><small>{t.last}</small>{x.lastSuccess}</span><em>{x.status}</em></div>)}</div>
        <div className="snapshot-note">{snapshot.snapshot.warning}</div>
      </section>
    </main>
    <footer><b>World Food Lens</b><span>{t.footer}</span><small>Git migration / v1.0</small></footer>
  </div>
}
function Slider({label,value,set}){
  return <label className="slider"><span>{label}<b>{value>=0?"+":""}{value}%</b></span><input type="range" min="-50" max="100" value={value} onChange={e=>set(+e.target.value)}/></label>
}
function TableBox({kicker,title,rows,lang}){
  const t=copy[lang];
  return <article className="table-box"><div className="kicker">{kicker}</div><h3>{title}</h3><div className="unit">USD / mt</div><table><thead><tr><th>{t.crop}</th><th>{t.monthly}</th><th>{t.change}</th></tr></thead><tbody>{rows.map(r=><tr key={r.nameEn}><td><b>{lang==="zh"?r.nameZh:r.nameEn}</b><small>{r.period}</small></td><td>{r.price.toFixed(2)}</td><td className={r.momPct>=0?"up":"down"}>{pct(r.momPct)}</td></tr>)}</tbody></table></article>
}
createRoot(document.getElementById("root")).render(<App/>);

import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine
} from "recharts";
import snapshot from "./data/recoveredSnapshot";
import initialOfficialData from "virtual:official-data";
import {createDashboard,getDashboardMetrics} from "./data/dashboardMetrics";
import {refreshOfficialData,sourceStateLabel,validateOfficialBundle} from "./services/officialSources";
import {nextTheme,resolveTheme,THEME_STORAGE_KEY} from "./services/theme";
import SourceDesk from "./components/SourceDesk";
import ClimateMonitor from "./components/ClimateMonitor";
import PolicyEvents from "./components/PolicyEvents";
import SupplyHistory from "./components/SupplyHistory";
import PriceOutlook from "./components/PriceOutlook";
import ReleaseCalendar from "./components/ReleaseCalendar";
import GlobalFoodStress from "./components/GlobalFoodStress";
import GrainInventory from "./components/GrainInventory";
import CropCriticalWindow from "./components/CropCriticalWindow";
import FoodHistory from "./components/FoodHistory";
import HomeOrientation,{HomeHero} from "./components/HomeOrientation";
import DetailModule from "./components/DetailModule";
import useFoodStress from "./hooks/useFoodStress";
import "./styles.css";

const copy = {
  zh:{
    badge:"全球视角 · 官方数据 · 清晰解读",
    hero:"看懂粮价背后的变化。",
    intro:"从油价与化肥，到全球收成和贸易政策。把分散的信号，放到一起观察。",
    sync:"官方定时缓存 · 观测期和数据状态见各模块",
    dataSources:"数据来源", check:"检查更新", english:"Switch to English", lightMode:"浅色", darkMode:"深色",
    nav:["价格与成本","产量与库存","全球政策库","如何影响粮价","成本实验室","投资标的"],
    priceTitle:"粮价与能源，是否同向变化？", recovered:"旧站恢复快照",
    normalized:"共同起点 = 100", raw:"查看月度数据",
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
    causalityText:"时间上的先后或同时上涨不能证明政策效果。价格展望是单独标注的实验模型，需结合其历史误差、假设和局限阅读。",
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
    sync:"Scheduled official cache · periods and data status shown per section",
    dataSources:"Data sources", check:"Check updates", english:"中文", lightMode:"Light", darkMode:"Dark",
    nav:["Prices & costs","Supply & stocks","Global policy","How it transmits","Cost lab","Investments"],
    priceTitle:"Do food and energy prices move together?", recovered:"Recovered hosted-site snapshot",
    normalized:"Common starting point = 100", raw:"View monthly data",
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
    causalityText:"Timing or simultaneous increases do not establish policy effects. Price Outlook is a separately labelled experimental model; read its historical errors, assumptions and limitations.",
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
  {symbol:"MOO",name:"VanEck Agribusiness ETF",zh:"全球农业企业 ETF",en:"Global agribusiness ETF",tvSymbol:"AMEX:MOO",descZh:"持有农业产业链企业股票，覆盖农业投入品、设备和生产等环节。表现受企业盈利与股票市场估值影响。",descEn:"Holds agribusiness equities across inputs, equipment and production. Returns reflect corporate earnings and equity valuations."},
  {symbol:"VEGI",name:"iShares MSCI Agriculture Producers ETF",zh:"农业生产商 ETF",en:"Agriculture producers ETF",tvSymbol:"AMEX:VEGI",descZh:"通过农业生产相关企业的股票组合观察产业链，覆盖化肥、农机和食品等业务；与商品期货基金的风险来源不同。",descEn:"Tracks a basket of agriculture-related producers, including fertilizer, machinery and food businesses, with different risk drivers from commodity futures funds."},
  {symbol:"CF",name:"CF Industries Holdings",zh:"氮肥与天然气成本",en:"Nitrogen fertilizer",tvSymbol:"NYSE:CF",descZh:"氮肥生产商，可用于观察化肥需求与天然气原料成本之间的关系。股价也受企业经营和整体市场影响。",descEn:"A nitrogen fertilizer producer linking nutrient demand with natural-gas feedstock costs. Business performance and the broader equity market also affect its share price."},
  {symbol:"AGCO",name:"AGCO Corporation",zh:"农机与精准农业",en:"Machinery & precision agriculture",tvSymbol:"NYSE:AGCO",descZh:"农业机械及精准农业解决方案供应商，可观察农场资本开支和设备更新周期。",descEn:"Supplies agricultural machinery and precision-agriculture solutions, providing exposure to farm capital spending and equipment replacement cycles."},
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

function TradingViewChart({instrument,lang,theme}){
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
      theme,
      backgroundColor:theme==="dark"?"#151b18":"#ffffff",
      gridColor:theme==="dark"?"rgba(214, 229, 218, 0.08)":"rgba(46, 46, 46, 0.06)",
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
    return ()=>{ script.onerror=null; script.remove(); };
  },[instrument.tvSymbol,lang,theme]);

  const t=copy[lang];
  return <div className="market-chart">
    <div className="market-chart-head"><b>{t.marketChart}</b><span>{instrument.tvSymbol}</span></div>
    {loadFailed&&<div className="chart-fallback" role="status">{t.chartUnavailable}</div>}
    <div className="market-chart-frame">
    <div className="tradingview-widget-container" ref={container} style={{height:"100%",width:"100%"}}>
      <div className="tradingview-widget-container__widget" style={{height:"calc(100% - 32px)",width:"100%"}}/>
      <div className="tradingview-widget-copyright">
        <a href={href} rel="noopener nofollow" target="_blank">{instrument.symbol} chart</a><span> by TradingView</span>
      </div>
    </div>
    </div>
    <div className="market-note"><span>{t.marketNotice}</span><a href={href} rel="noopener nofollow" target="_blank">{t.viewOnTradingView} ↗</a></div>
  </div>
}

function pct(v){ return Number.isFinite(v)?`${v>=0?"+":""}${v.toFixed(1)}%`:"—"; }
function normalize(rows,key){
  const base = rows.find(row=>Number.isFinite(row[key]) && row[key]>0)?.[key];
  return rows.map(r=>({...r,[`${key}N`]: Number.isFinite(r[key])&&base?+(r[key]/base*100).toFixed(2):null}));
}
function DataBadge({record,lang}){
  return <div className="data-badge">{record?<>
    <a href={record.source.url} target="_blank" rel="noopener noreferrer">{record.source.label} ↗</a>
    <span>{sourceStateLabel(record,lang)}</span>
    <small>{lang==="zh"?"抓取":"Fetched"}: {record.fetchedAt}</small>
  </>:<span>{copy[lang].recovered}</span>}</div>;
}
function Kpi({label,value,change,period,unit,lang,source,estimate=false,changeUnit="%"}){
  const up = change>0;
  return <div className="kpi">
    <span>{label}</span><strong>{value}</strong>
    <b className={up?"up":"down"}>{!Number.isFinite(change)?"—":<>{change===0?"→":up?"↑":"↓"} {changeUnit==="pp" ? `${change>0?"+":""}${change.toFixed(1)} pp` : pct(change)}</>}</b>
    <small>{period} · {unit}</small>
    {estimate&&<small>{lang==="zh"?"含预测/估计 · 可修订":"Forecast/estimate · revisable"}</small>}
    <DataBadge record={source} lang={lang}/>
  </div>
}
function App(){
  const [lang,setLang]=useState("zh");
  const [theme,setTheme]=useState(()=>resolveTheme(
    document.documentElement.dataset.theme,
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ));
  const [range,setRange]=useState(36);
  const [rawOpen,setRawOpen]=useState(false);
  const [refreshMsg,setRefreshMsg]=useState("");
  const [refreshing,setRefreshing]=useState(false);
  const [official,setOfficial]=useState(()=>validateOfficialBundle(initialOfficialData));
  const [fuel,setFuel]=useState(0), [fert,setFert]=useState(0), [other,setOther]=useState(0);
  const [selected,setSelected]=useState(investments.find(x=>x.symbol==="DBA"));
  const t=copy[lang];

  const stressModel=useFoodStress(official);
  useEffect(()=>{document.documentElement.lang=lang==="zh"?"zh-CN":"en";},[lang]);
  const dashboard=useMemo(()=>createDashboard(snapshot,official),[official]);
  const {provenance}=dashboard;
  const {faoFoodPriceIndex:fao,brent,urea,wheat,wheatHistory}=getDashboardMetrics(dashboard);
  const rows=useMemo(()=>normalize(dashboard.monthly.slice(-range),"fao"),[dashboard,range]);
  const chart=useMemo(()=>{
    const baseB=rows.find(row=>Number.isFinite(row.brent)&&row.brent>0)?.brent;
    return rows.map(r=>({...r,brentN:Number.isFinite(r.brent)&&baseB?+(r.brent/baseB*100).toFixed(2):null}));
  },[rows]);
  const total=0.2*fuel+0.3*fert+0.5*other;

  useEffect(()=>{
    let cancelled=false;
    refreshOfficialData().then(data=>{if(!cancelled)setOfficial(data);})
      .catch(()=>{if(!cancelled)setRefreshMsg("failed");});
    return ()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
  },[theme]);

  useEffect(()=>{
    const media=window.matchMedia?.("(prefers-color-scheme: dark)");
    if(!media)return;
    const syncSystemTheme=event=>{
      try{
        if(localStorage.getItem(THEME_STORAGE_KEY))return;
      }catch{}
      setTheme(resolveTheme(null,event.matches));
    };
    media.addEventListener?.("change",syncSystemTheme);
    return ()=>media.removeEventListener?.("change",syncSystemTheme);
  },[]);

  function toggleTheme(){
    const updated=nextTheme(theme);
    setTheme(updated);
    try{localStorage.setItem(THEME_STORAGE_KEY,updated);}catch{}
  }

  async function doRefresh(){
    if(refreshing)return;
    setRefreshing(true);
    try{setOfficial(await refreshOfficialData());setRefreshMsg("loaded");}
    catch{setRefreshMsg("failed");}
    finally{setRefreshing(false);}
  }

  return <div className="app">
    <header className="top">
      <div className="brand"><b>WFL</b><div><strong>World Food Lens</strong><span>全球粮食观察</span></div></div>
      <div className="actions">
        <a href="#data-desk">{t.dataSources}</a>
        <button onClick={doRefresh} disabled={refreshing}>↻ {refreshing?(lang==="zh"?"检查中…":"Checking…"):t.check}</button>
        <button className="theme-toggle" onClick={toggleTheme} aria-label={lang==="zh"?`切换到${theme==="dark"?"浅色":"深色"}模式`:`Switch to ${theme==="dark"?"light":"dark"} mode`} title={theme==="dark"?t.lightMode:t.darkMode}>
          <span aria-hidden="true">{theme==="dark"?"☀":"☾"}</span> {theme==="dark"?t.lightMode:t.darkMode}
        </button>
        <button onClick={()=>setLang(lang==="zh"?"en":"zh")}>{t.english}</button>
      </div>
    </header>

    <main>
      <HomeHero lang={lang} model={stressModel}>
        {refreshMsg && <div className="notice" role="status">{refreshMsg==="loaded"?(lang==="zh"?"已读取网站最新发布的缓存。此按钮不会直接触发官方接口抓取；各来源的成功/失败状态见数据来源。":"Loaded the site's latest published cache. This button does not trigger upstream downloads; source success/failure is shown in Data Desk."):(lang==="zh"?"网站缓存暂时无法读取，继续显示已载入的数据。":"The published cache could not be read; previously loaded data remain visible.")}</div>}
      </HomeHero>
      <HomeOrientation lang={lang}/>

      <nav className="section-nav" aria-label={lang==="zh"?"页面模块导航":"Page sections"}>
        <a href="#home">{lang==="zh"?"首页导览":"Start here"}</a>
        <a href="#food-stress">{lang==="zh"?"粮食压力":"Food stress"}</a>
        <a href="#grain-inventory">{lang==="zh"?"三谷物库存":"Grain inventories"}</a>
        <a href="#crop-windows">{lang==="zh"?"作物窗口":"Crop windows"}</a>
        {t.nav.map((x,i)=><React.Fragment key={x}><a href={`#s${i+1}`}>{x}</a>{i===1&&<a href="#climate">{lang==="zh"?"气候监测":"Climate monitor"}</a>}</React.Fragment>)}
        <a href="#price-outlook">{lang==="zh"?"价格展望":"Price outlook"}</a>
        <a href="#release-calendar">{lang==="zh"?"发布日历":"Release calendar"}</a>
      </nav>

      <GlobalFoodStress bundle={official} lang={lang} model={stressModel}/>

      <CropCriticalWindow lang={lang}/>

      <section id="grain-inventory" className="section alt"><GrainInventory record={official.sources.usda} lang={lang}/></section>

      <DetailModule id="s2" title={lang==="zh"?"查看详细供需历史":"Explore supply history"} description={lang==="zh"?`产量与消费能否平衡？展开 ${wheatHistory.length} 年小麦图表与数据。`:`Can harvests keep up? Expand ${wheatHistory.length} years of wheat charts and data.`}>
      <section id="s2-content" className="section alt">
        <div className="section-no">02 / USDA • WORLD TOTAL</div>
        <h2>{t.usdaTitle}</h2>
        <div className="usda-grid">
          <div className="ratio-card"><span>{t.ratio}</span><strong>{wheat.value.toFixed(1)}%</strong><b className={wheat.deltaPp>0?"up":"down"}>{wheat.deltaPp>0?"+":""}{wheat.deltaPp.toFixed(1)} pp</b><small>{wheat.period} · USDA PSD · {provenance.usda?(lang==="zh"?"含预测/估计，可修订":"Includes forecasts/estimates; subject to revision"):t.recovered}</small></div>
          <SupplyHistory history={wheatHistory} lang={lang} official={!!provenance.usda}/>
        </div>
        <DataBadge record={provenance.usda} lang={lang}/>
        <div className="explain"><b>{lang==="zh"?"库存消费比是什么？":"What is stock-to-use?"}</b><p>{t.ratioHelp}</p><small>{provenance.usda?(lang==="zh"?"比率由 USDA 世界小麦期末库存和国内消费计算。市场年度不是自然年；最新年度可能为预测，历史值也可能修订。":"Ratios are calculated from USDA world wheat ending stocks and domestic consumption. Marketing years differ from calendar years; recent years can be forecasts and historical values can be revised."):(lang==="zh"?"当前为旧站恢复的比率，尚无可用的官方完整供需序列。":"Recovered ratios remain displayed; a verified full supply/use series is not yet available.")}</small></div>
        {provenance.usda&&<details className="supply-details"><summary>{lang==="zh"?"查看产量、消费和库存（千公吨）":"View production, use and stocks (thousand metric tons)"}</summary><div className="raw-table"><table><thead><tr><th>{lang==="zh"?"市场年度":"Marketing year"}</th><th>{lang==="zh"?"产量":"Production"}</th><th>{lang==="zh"?"国内消费":"Domestic use"}</th><th>{lang==="zh"?"期末库存":"Ending stocks"}</th></tr></thead><tbody>{wheatHistory.map(row=><tr key={row.year}><td>{row.year}</td><td>{row.production?.toLocaleString()}</td><td>{row.consumption?.toLocaleString()}</td><td>{row.endingStocks?.toLocaleString()}</td></tr>)}</tbody></table></div></details>}
      </section>
      </DetailModule>


      <DetailModule id="s3" anchorPrefix="policy-" title={lang==="zh"?"贸易与政策：供应如何流动":"Trade & policy: how supply moves"} description={lang==="zh"?"展开历史事件库与搜索；不是实时限制清单。":"Search historical events; not a live list of restrictions."}>
        <PolicyEvents lang={lang} sectionId="s3-content"/>
      </DetailModule>


      <DetailModule id="s4" title={lang==="zh"?"能源与化肥：压力如何传导":"Energy & fertilizer: how stress transmits"} description={lang==="zh"?"展开能源、库存和政策的解释，不把关联当因果。":"Explore energy, inventory and policy mechanisms, without assuming causality."}>
      <section id="s4-content" className="section alt">
        <div className="section-no">04 / CONNECT THE DOTS</div><h2>{t.dots}</h2>
        <div className="three">
          <article><i>01</i><h3>{t.energy}</h3><p>{t.energyText}</p></article>
          <article><i>02</i><h3>{t.stocks}</h3><p>{t.stocksText}</p></article>
          <article><i>03</i><h3>{t.policy}</h3><p>{t.policyText}</p></article>
        </div>
        <div className="caution"><b>{t.causality}</b><p>{t.causalityText}</p></div>
      </section>
      </DetailModule>


      <DetailModule id="s1" title={lang==="zh"?"市场确认：价格与成本":"Market confirmation: prices & costs"} description={lang==="zh"?"展开四项指标、粮价/原油曲线及化肥与农产品基准。":"Expand headline indicators, food/oil charts and commodity benchmarks."}>
      <section className="kpis">
        <Kpi lang={lang} source={provenance.fao} label={lang==="zh"?"FAO 粮食价格指数":"FAO Food Price Index"} value={fao.value.toFixed(1)} change={fao.momPct} period={fao.period} unit={fao.unit}/>
        <Kpi lang={lang} source={provenance.brent} label={lang==="zh"?"Brent 原油":"Brent crude"} value={`$${brent.value.toFixed(2)}`} change={brent.momPct} period={brent.period} unit={lang==="zh"?"美元 / 桶":brent.unit}/>
        <Kpi lang={lang} source={provenance.urea} label={lang==="zh"?"尿素基准价格":"Urea benchmark"} value={`$${urea.value.toFixed(1)}`} change={urea.momPct} period={urea.period} unit={lang==="zh"?"美元 / 公吨":urea.unit}/>
        <Kpi lang={lang} source={provenance.usda} estimate={!!provenance.usda} label={t.ratio} value={`${wheat.value.toFixed(1)}%`} change={wheat.deltaPp} changeUnit="pp" period={wheat.period} unit={wheat.unit}/>
      </section>
      <section id="s1-content" className="section">
        <div className="section-no">01 / PRICE PATH</div>
        <div className="section-head">
          <div><h2>{t.priceTitle}</h2><p>{lang==="zh"?"图中序列统一换算为共同起点 = 100，便于比较变化幅度，不代表价格水平相同。共同波动不等于因果关系。":"Series are rebased to a common starting point of 100 for change comparison. Co-movement does not establish causality."}</p></div>
          <div className="select-wrap"><label>{lang==="zh"?"时间范围":"Range"}</label><select value={range} onChange={e=>setRange(+e.target.value)}><option value="12">{lang==="zh"?"近 12 个月":"12 months"}</option><option value="36">{lang==="zh"?"近 36 个月":"36 months"}</option></select></div>
        </div>
        <div className="chart-card">
          <div className="chart-provenance">{provenance.officialChart?<>
            <DataBadge record={provenance.fao} lang={lang}/><DataBadge record={provenance.brent} lang={lang}/>
            <small>{lang==="zh"?"仅比较两来源共同覆盖的月份；不拼接旧站恢复值。":"Only overlapping official months are compared; recovered rows are never appended."}</small>
          </>:<p>{t.recovered} · {lang==="zh"?"官方序列尚未共同覆盖至少两个月，暂保留原图。":"Fewer than two overlapping official months; the original recovered chart is retained."}</p>}</div>
          <div className="legend"><span>● FAO</span><span>● Brent</span><b>{t.normalized}</b></div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="month" minTickGap={36}/><YAxis domain={["auto","auto"]}/><Tooltip formatter={(v,n)=>[v,n==="faoN"?"FAO":"Brent"]}/>
                <ReferenceLine y={100} strokeDasharray="5 5"/>
                <Line type="linear" dataKey="faoN" stroke="#315d48" strokeWidth={2.6} dot={false} connectNulls={false}/>
                <Line type="linear" dataKey="brentN" stroke="#ad7252" strokeWidth={2.2} dot={false} connectNulls={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <button className="text-btn" onClick={()=>setRawOpen(!rawOpen)}>{t.raw} {rawOpen?"▲":"▼"}</button>
          {rawOpen && <div className="raw-table"><table><thead><tr><th>{lang==="zh"?"月份":"Month"}</th><th>FAO</th><th>Brent</th></tr></thead><tbody>{rows.map(r=><tr key={r.month}><td>{r.month}</td><td>{r.fao?.toFixed(2)??"—"}</td><td>{Number.isFinite(r.brent)?`$${r.brent.toFixed(2)}`:"—"}</td></tr>)}</tbody></table></div>}
        </div>

        <div className="split">
          <TableBox kicker="WORLD BANK / FERTILIZERS" title={t.fertilizerTitle} rows={dashboard.fertilizers} lang={lang} source={provenance.worldBank}/>
          <TableBox kicker="WORLD BANK / AGRICULTURE" title={t.agriTitle} rows={dashboard.agriculture} lang={lang} source={provenance.worldBank}/>
        </div>
      </section>
      </DetailModule>


      <DetailModule id="climate" title={lang==="zh"?"气候背景：NOAA 海温观测":"Climate context: NOAA ocean observations"} description={lang==="zh"?"海温不是地区天气，更不是作物损失。":"Ocean temperatures are not local weather or crop losses."}>
        <ClimateMonitor record={official.sources.noaa} lang={lang} sectionId="climate-content"/>
      </DetailModule>


      <DetailModule id="price-outlook" title={lang==="zh"?"实验价格展望":"Experimental price outlook"} description={lang==="zh"?"展开未来 12 个月情景、历史误差与模型方法。":"Explore 12-month scenarios, historical errors and model methodology."}>
        <PriceOutlook record={official.sources.fao} lang={lang} sectionId="price-outlook-content"/>
      </DetailModule>


      <DetailModule id="release-calendar" title={lang==="zh"?"下一批官方数据何时发布？":"When is the next official release?"} description={lang==="zh"?"展开已确认排期与未来一年的预计窗口。":"Explore confirmed dates and estimated windows for the coming year."}>
        <ReleaseCalendar lang={lang} sectionId="release-calendar-content"/>
      </DetailModule>


      <FoodHistory lang={lang}/>

      <DetailModule id="s5" title={lang==="zh"?"试一试：投入成本实验室":"Try it: input-cost lab"} description={lang==="zh"?"手动调整假设，观察总成本变化；不是粮价预测。":"Adjust assumptions and explore total costs—not a food-price forecast."}>
      <section id="s5-content" className="section">
        <div className="section-no">05 / LEARNING LAB</div><h2>{t.lab}</h2><p>{t.labHelp}</p>
        <div className="lab">
          <Slider label={t.fuel} value={fuel} set={setFuel}/><Slider label={t.fert} value={fert} set={setFert}/><Slider label={t.other} value={other} set={setOther}/>
          <div className="formula"><span>{t.total}</span><strong>{total>=0?"+":""}{total.toFixed(1)}%</strong><code>ΔC = 0.2×ΔFuel + 0.3×ΔFertilizer + 0.5×ΔOther</code><button onClick={()=>{setFuel(0);setFert(0);setOther(0)}}>{t.reset}</button></div>
        </div>
      </section>
      </DetailModule>


      <DetailModule id="s6" title={lang==="zh"?"最后看市场：农业敏感资产":"Then explore agriculturally sensitive assets"} description={lang==="zh"?"12 个现有标的及 TradingView 图表；不是买卖建议。":"12 existing instruments with TradingView charts; not trading recommendations."}>
      <section id="s6-content" className="section alt">
        <div className="section-no">06 / INVESTMENT LENS</div><h2>{t.invest}</h2><p>{t.investHelp}</p>
        <div className="invest-grid">
          <div className="tickers" aria-label={t.invest}>{investments.map(x=><button aria-pressed={x.symbol===selected.symbol} className={x.symbol===selected.symbol?"active":""} key={x.symbol} onClick={()=>setSelected(x)}><b>{x.symbol}</b><span>{lang==="zh"?x.zh:x.en}</span></button>)}</div>
          <div className="security">
            <span className="big-symbol">{selected.symbol}</span><h3>{selected.name}</h3><p><b>{t.exposure}:</b> {lang==="zh"?selected.zh:selected.en}</p>
            <div className="instrument-context"><b>{t.whyItMatters}</b><p>{lang==="zh"?selected.descZh:selected.descEn}</p></div>
            <TradingViewChart key={`${selected.tvSymbol}-${lang}-${theme}`} instrument={selected} lang={lang} theme={theme}/>
          </div>
        </div>
      </section>
      </DetailModule>


      <SourceDesk bundle={official} lang={lang} recovered={snapshot}/>
    </main>
    <footer><b>World Food Lens</b><span>{t.footer}</span><small>Official data / v1.1</small></footer>
  </div>
}
function Slider({label,value,set}){
  return <label className="slider"><span>{label}<b>{value>=0?"+":""}{value}%</b></span><input type="range" min="-50" max="100" value={value} onChange={e=>set(+e.target.value)}/></label>
}
function TableBox({kicker,title,rows,lang,source}){
  const t=copy[lang];
  return <article className="table-box"><div className="kicker">{kicker}</div><h3>{title}</h3><div className="unit">USD / mt</div><DataBadge record={source} lang={lang}/><table><thead><tr><th>{t.crop}</th><th>{t.monthly}</th><th>{t.change}</th></tr></thead><tbody>{rows.map(r=><tr key={r.nameEn}><td><b>{lang==="zh"?r.nameZh:r.nameEn}</b><small>{r.period}</small></td><td>{r.price.toFixed(2)}</td><td className={r.momPct>=0?"up":"down"}>{pct(r.momPct)}</td></tr>)}</tbody></table></article>
}
createRoot(document.getElementById("root")).render(<App/>);

import React, {useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, AreaChart, Area, BarChart, Bar
} from "recharts";
import "./styles.css";

const foodHistory = [
  {year:"1990", index:55},{year:"1995",index:61},{year:"2000",index:58},
  {year:"2005",index:72},{year:"2008",index:118},{year:"2010",index:106},
  {year:"2011",index:131},{year:"2015",index:93},{year:"2020",index:99},
  {year:"2022",index:144},{year:"2024",index:122},{year:"2026",index:126}
];

const commodities = [
  {name:"Wheat", price:"—", change:"Connect API", risk:"Medium"},
  {name:"Corn", price:"—", change:"Connect API", risk:"Medium"},
  {name:"Rice", price:"—", change:"Connect API", risk:"Low–Med"},
  {name:"Soybeans", price:"—", change:"Connect API", risk:"Medium"},
  {name:"Fertilizer", price:"—", change:"World Bank", risk:"High"},
  {name:"Crude Oil", price:"—", change:"Market API", risk:"Medium"}
];

const investments = [
  {symbol:"DBA", name:"Invesco DB Agriculture Fund", exposure:"Broad agriculture"},
  {symbol:"CORN", name:"Teucrium Corn Fund", exposure:"Corn"},
  {symbol:"WEAT", name:"Teucrium Wheat Fund", exposure:"Wheat"},
  {symbol:"SOYB", name:"Teucrium Soybean Fund", exposure:"Soybeans"},
  {symbol:"MOS", name:"The Mosaic Company", exposure:"Fertilizer"},
  {symbol:"NTR", name:"Nutrien", exposure:"Fertilizer"},
  {symbol:"DE", name:"Deere & Company", exposure:"Farm equipment"},
  {symbol:"ADM", name:"Archer-Daniels-Midland", exposure:"Grain processing"}
];

const policies = [
  {date:"2026-09", country:"Global", event:"Policy feed placeholder", impact:"Connect official/curated policy sources"},
  {date:"2026-09", country:"Data layer", event:"Automated updates", impact:"Normalize export bans, tariffs, subsidies and stock releases"}
];

const i18n = {
  en: {
    title:"World Food Crisis", subtitle:"Global Food Intelligence Dashboard",
    overview:"Overview", prices:"Food Prices", supply:"Supply & Stocks", policy:"Policy",
    invest:"Investments", climate:"Climate Risk", global:"Global Food Price Index",
    drivers:"Key Pressure Signals", commodities:"Commodity Monitor", investment:"Investable U.S. Market Exposure",
    policyTitle:"Global Policy Monitor", note:"Data architecture is ready for official-source integrations. Placeholder values are clearly marked."
  },
  zh: {
    title:"全球粮食危机", subtitle:"全球粮食情报仪表盘",
    overview:"总览", prices:"粮食价格", supply:"产量与库存", policy:"政策",
    invest:"投资标的", climate:"气候风险", global:"全球粮食价格指数",
    drivers:"主要压力信号", commodities:"商品监测", investment:"美国市场可投资标的",
    policyTitle:"全球政策监测", note:"数据架构已为官方数据源接入预留接口；尚未接入的数据均明确标注。"
  }
};

function App(){
  const [lang,setLang] = useState("en");
  const [selected,setSelected] = useState(investments[0]);
  const t=i18n[lang];

  return <div className="app">
    <header>
      <div>
        <div className="eyebrow">FOOD • ENERGY • POLICY • MARKETS</div>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
      </div>
      <button className="lang" onClick={()=>setLang(lang==="en"?"zh":"en")}>
        {lang==="en" ? "中文" : "English"}
      </button>
    </header>

    <nav>{[t.overview,t.prices,t.supply,t.policy,t.invest,t.climate].map(x=><span key={x}>{x}</span>)}</nav>

    <main>
      <section className="hero-grid">
        <article className="card chart-card">
          <div className="card-title"><h2>{t.global}</h2><span className="tag">FAO-ready</span></div>
          <p className="muted">Illustrative historical series until live FAOSTAT/FAO feed is connected.</p>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={foodHistory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="year"/><YAxis/><Tooltip/>
                <Area type="monotone" dataKey="index" fillOpacity={0.16}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card">
          <div className="card-title"><h2>{t.drivers}</h2><span className="tag alert">Watch</span></div>
          <div className="signals">
            <div><b>Climate</b><span>El Niño / La Niña</span><strong>Monitor</strong></div>
            <div><b>Energy</b><span>Oil → transport & inputs</span><strong>Monitor</strong></div>
            <div><b>Fertilizer</b><span>Input-cost transmission</span><strong>Monitor</strong></div>
            <div><b>Policy</b><span>Export bans / tariffs</span><strong>Monitor</strong></div>
            <div><b>Stocks</b><span>USDA ending inventories</span><strong>Monitor</strong></div>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-title"><h2>{t.commodities}</h2><span className="tag">World Bank + market APIs</span></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Asset</th><th>Latest</th><th>Source</th><th>Risk</th></tr></thead>
          <tbody>{commodities.map(c=><tr key={c.name}><td><b>{c.name}</b></td><td>{c.price}</td><td>{c.change}</td><td>{c.risk}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section className="two-col">
        <article className="card">
          <div className="card-title"><h2>{t.investment}</h2><span className="tag">Market-data ready</span></div>
          <div className="ticker-grid">
            {investments.map(x=><button key={x.symbol} onClick={()=>setSelected(x)} className={selected.symbol===x.symbol?"ticker active":"ticker"}>
              <b>{x.symbol}</b><span>{x.exposure}</span>
            </button>)}
          </div>
        </article>
        <article className="card detail">
          <span className="symbol">{selected.symbol}</span>
          <h2>{selected.name}</h2>
          <p>{selected.exposure}</p>
          <div className="placeholder-chart">
            Historical price chart
            <small>Connect a licensed/current market-data provider</small>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="card-title"><h2>{t.policyTitle}</h2><span className="tag">Auto-update planned</span></div>
        {policies.map((p,i)=><div className="policy-row" key={i}><time>{p.date}</time><b>{p.country}</b><span>{p.event}</span><small>{p.impact}</small></div>)}
      </section>

      <section className="sources">
        <h3>Planned authoritative sources</h3>
        <p>FAO / FAOSTAT · World Bank Commodity Price Data (Pink Sheet) · USDA PSD / WASDE · EIA · NOAA / climate agencies · official government policy releases.</p>
        <p className="warning">{t.note}</p>
      </section>
    </main>
    <footer>World Food Crisis • Open data intelligence project • v0.1.0</footer>
  </div>
}
createRoot(document.getElementById("root")).render(<App/>);

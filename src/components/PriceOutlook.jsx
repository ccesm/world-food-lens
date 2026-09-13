import React,{useMemo,useState} from "react";
import {ResponsiveContainer,ComposedChart,Line,Area,CartesianGrid,XAxis,YAxis,Tooltip,ReferenceLine} from "recharts";
import {buildPriceForecast} from "../services/priceForecast.js";
import {hasOfficialData,sourceStateLabel} from "../services/officialSources.js";
import "../outlook.css";

export default function PriceOutlook({record,lang}) {
  const zh=lang==="zh", [shock,setShock]=useState(0);
  const result=useMemo(()=>buildPriceForecast(hasOfficialData("fao",record)?record.data.monthly:[],shock),[record,shock]);
  const label={actual:zh?"已发布指数":"Published index",forecast:zh?"模型基线":"Model baseline",scenario:zh?"自设情景":"User scenario",band:zh?"历史误差参考带":"Historical error band"};
  const chart=result.available?[...result.history.slice(0,-1),{...result.history.at(-1),forecast:result.lastValue,scenario:result.lastValue},...result.points]:[];
  return <section id="price-outlook" className="section outlook-section">
    <div className="section-no">PRICE OUTLOOK · EXPERIMENTAL</div>
    <h2>{zh?"未来一年，粮价可能怎样变化？":"Where could food prices go over the next year?"}</h2>
    <p>{zh?"实验模型预测 FAO 全球粮食价格指数，单位为指数点（2014–2016 = 100）。预测从最后一个已发布月份起算 12 个月，不代表 ETF、股票或单一作物价格。":"An experimental forecast of the FAO global Food Price Index, in index points (2014–2016 = 100). The horizon is 12 months after the last published month, not an ETF, equity or individual crop forecast."}</p>
    {!result.available?<div className="notice">{zh?"至少需要 84 个连续月份的有效官方指数。当前数据不足或有缺口，暂不生成预测。":"At least 84 consecutive valid official monthly observations are required. Forecast unavailable because data are insufficient or contain gaps."}</div>:<>
      <div className="outlook-summary">
        <article><small>{zh?"最后已发布观测":"Last published observation"} · {result.lastMonth}</small><strong>{result.lastValue.toFixed(1)}</strong><span>{sourceStateLabel(record,lang)}</span></article>
        <article><small>{zh?"12 个月模型基线":"12-month model baseline"} · {result.points.at(-1).month}</small><strong>{result.points.at(-1).forecast.toFixed(1)}</strong><span>{zh?"模型估计，非官方预测":"Model estimate, not an official forecast"}</span></article>
        <article><small>{zh?"12 个月历史误差参考带":"12-month historical error band"}</small><strong>{result.points.at(-1).band.map(x=>x.toFixed(1)).join(" – ")}</strong><span>{zh?"滚动误差的 10%–90% 分位范围":"10th–90th percentiles of rolling forecast errors"}</span></article>
      </div>
      <div className="chart-card">
        <div className="outlook-legend"><span>● {label.actual}</span><span>┄ {label.forecast}</span><span>▒ {label.band}</span>{shock!==0&&<span>● {label.scenario}</span>}</div>
        <div className="chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{left:5,right:15,top:12}}>
          <CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month" minTickGap={42}/><YAxis domain={["auto","auto"]} width={45}/>
          <Tooltip formatter={(value,name)=>[Array.isArray(value)?value.map(x=>x.toFixed(1)).join(" – "):Number(value).toFixed(1),label[name]||name]}/>
          <Area dataKey="band" stroke="none" fill="#88aa98" fillOpacity={.25} isAnimationActive={false}/>
          <Line dataKey="actual" stroke="#64a782" dot={false} strokeWidth={2.5} isAnimationActive={false}/>
          <Line dataKey="forecast" stroke="#b68b54" strokeDasharray="6 4" dot={false} strokeWidth={2.5} isAnimationActive={false}/>
          {shock!==0&&<Line dataKey="scenario" stroke="#859ede" dot={false} strokeWidth={2} isAnimationActive={false}/>}
          <ReferenceLine x={result.lastMonth} stroke="#87988d" strokeDasharray="3 3"/>
        </ComposedChart></ResponsiveContainer></div>
        <label className="scenario-control">{zh?"自设一年额外价格冲击":"Assumed extra one-year price shock"}: {shock>0?"+":""}{shock}%
          <input type="range" min="-30" max="30" step="1" value={shock} onChange={e=>setShock(Number(e.target.value))}/>
        </label>
        <button className="text-btn" onClick={()=>setShock(0)}>{zh?"重置情景":"Reset scenario"}</button>
        <p className="outlook-note">{zh?"情景冲击由你设定，按月份逐步叠加到基线；可用于讨论天气、政策或战争冲击，但不是这些因素的估计效应。阴影只对应未加冲击的模型基线，不包含额外情景风险。":"The assumed shock builds gradually over the baseline. It can frame weather, policy or conflict scenarios, but does not estimate their effects. Shading applies only to the unshocked baseline and excludes additional scenario risk."}</p>
      </div>
      <details className="outlook-method" open><summary>{zh?"模型方法与历史检验":"Method and historical evaluation"}</summary>
        <p>{zh?`WFL v1：对数月涨跌幅的一阶自回归模型，固定岭惩罚 0.01，系数限制在 ±0.95；最近最多 120 个月训练（${result.trainingStart} 至 ${result.lastMonth}）。当前惯性系数 ${result.model.phi.toFixed(3)}。`:`WFL v1: AR(1) monthly log returns with a fixed ridge penalty of 0.01 and coefficient capped at ±0.95. Training uses up to 120 recent months (${result.trainingStart} to ${result.lastMonth}); current coefficient ${result.model.phi.toFixed(3)}.`}</p>
        <p>{zh?`滚动检验起点 ${result.originStart} 至 ${result.originEnd}。每次仅用该起点及之前的数据，与“价格保持不变”基线比较；下表为平均绝对误差（指数点，越低越好）。`:`Rolling origins: ${result.originStart} to ${result.originEnd}. Each fit uses only observations at or before its origin and is compared with unchanged prices. Mean absolute error below is in index points; lower is better.`}</p>
        <div className="raw-table"><table><thead><tr>{(zh?["预测跨度","模型误差","不变价误差","样本数"]:["Horizon","Model MAE","Flat-price MAE","Origins"]).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{[1,3,6,12].map(h=>{const p=result.points[h-1];return <tr key={h}><td>{h} {zh?"个月":"months"}</td><td>{p.mae.toFixed(2)}</td><td>{p.naiveMae.toFixed(2)}</td><td>{p.samples}</td></tr>})}</tbody></table></div>
        {result.points.at(-1).mae>=result.points.at(-1).naiveMae&&<p className="notice">{zh?"当前 12 个月检验中，模型未优于不变价基线；不能据此宣称有预测优势。":"The model does not beat unchanged prices at 12 months in this evaluation; no forecasting advantage is established."}</p>}
        <p>{zh?"检验使用当前修订后的历史数据，并非当时可获得的原始发布版本；各检验窗口重叠。误差带用同批滚动误差校准，未独立验证未来覆盖率。模型只拟合粮价自身历史，不能预测突发事件，不构成投资建议。":"Evaluation uses today's revised history, not original release vintages; windows overlap. Bands are calibrated on these rolling errors, without independent validation of future coverage. The model fits price history alone, cannot predict sudden events, and is not investment advice."}</p>
        <a className="source-link" href={record.source.url} target="_blank" rel="noopener noreferrer">FAO · {zh?"数据来源":"Data source"} ↗</a>
      </details>
      <details className="outlook-method"><summary>{zh?"查看未来 12 个月模型数值":"View 12-month model values"}</summary><div className="raw-table"><table><thead><tr>{(zh?["月份","基线","参考带下沿","参考带上沿","自设情景"]:["Month","Baseline","Band lower","Band upper","Scenario"]).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{result.points.map(p=><tr key={p.month}><td>{p.month}</td>{[p.forecast,...p.band,p.scenario].map((v,i)=><td key={i}>{v.toFixed(1)}</td>)}</tr>)}</tbody></table></div></details>
    </>}
  </section>;
}

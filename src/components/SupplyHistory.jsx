import React,{useState} from "react";
import {ResponsiveContainer,LineChart,Line,CartesianGrid,XAxis,YAxis,Tooltip} from "recharts";
import "../outlook.css";

export default function SupplyHistory({history,lang,official}) {
  const zh=lang==="zh",[range,setRange]=useState(0),[metric,setMetric]=useState("ratio");
  const rows=(range?history.slice(-range):history).map(row=>({...row,
    productionMt:Number.isFinite(row.production)?row.production/1000:null,
    consumptionMt:Number.isFinite(row.consumption)?row.consumption/1000:null}));
  const names={ratio:zh?"库存消费比":"Stock-to-use",productionMt:zh?"产量":"Production",consumptionMt:zh?"消费":"Use"};
  const quantities=rows.flatMap(row=>[row.productionMt,row.consumptionMt]).filter(Number.isFinite);
  const domain=metric==="ratio"?[0,Math.ceil(Math.max(...rows.map(row=>row.ratio))/10)*10]:[Math.floor(Math.min(...quantities)/50)*50,Math.ceil(Math.max(...quantities)/50)*50];
  return <div className="supply-history chart-card">
    <div className="release-controls"><label>{zh?"历史范围":"History range"}<select value={range} onChange={e=>setRange(Number(e.target.value))}><option value="0">{zh?"全部可用历史":"All available history"}</option><option value="20">{zh?"近 20 年":"20 years"}</option><option value="10">{zh?"近 10 年":"10 years"}</option></select></label><label>{zh?"比较指标":"Compare"}<select value={metric} onChange={e=>setMetric(e.target.value)}><option value="ratio">{names.ratio}</option>{official&&<option value="supply">{zh?"产量 vs 消费":"Production vs use"}</option>}</select></label></div>
    <p className="outlook-note">{rows[0]?.year} – {rows.at(-1)?.year} · {rows.length} {zh?"个市场年度":"marketing years"} · {metric==="ratio"?"%":(zh?"百万公吨":"million metric tons")}</p>
    <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart key={metric} data={rows} margin={{top:10,right:10,bottom:5,left:5}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="year" minTickGap={36}/><YAxis domain={domain} width={45}/><Tooltip formatter={(v,n)=>[`${Number(v).toFixed(1)}${metric==="ratio"?"%":""}`,names[n]]}/>
      <Line dataKey={metric==="ratio"?"ratio":"productionMt"} stroke="#64a782" dot={false} strokeWidth={2.5} isAnimationActive={false}/>
      <Line dataKey="consumptionMt" hide={metric!=="supply"} stroke="#c19265" dot={false} strokeWidth={2.5} isAnimationActive={false}/>
    </LineChart></ResponsiveContainer></div>
    {metric==="supply"&&<p className="outlook-note">● {names.productionMt} ({zh?"绿色":"green"}) · ● {names.consumptionMt} ({zh?"棕色":"brown"})</p>}
  </div>;
}

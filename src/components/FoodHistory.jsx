import React from "react";
const source="https://www.ers.usda.gov/amber-waves/2009/march/agricultural-commodity-price-spikes-in-the-1970s-and-1990s-valuable-lessons-for-today";
export default function FoodHistory({lang}) {
  const zh=lang==="zh";
  const events=zh?[
    ["1972","多个产区收成转弱","USDA 回顾指出，主要生产国的歉收使全球谷物产量下降。地区冲击需要放到全球供需中评估。"],
    ["1972–1973","意外进口需求遇上库存压力","苏联等经济体扩大国际采购，需求变化和库存缓冲共同影响市场。进口增长本身不证明存在隐秘短缺。"],
    ["1973–1974","能源、政策与宏观环境放大","能源成本和贸易政策等因素进一步改变农业成本与贸易环境。冲击通过多条路径传导，并非单一收成事件。"],
  ]:[
    ["1972","Harvest weakness across producers","USDA’s retrospective describes lower global grain output amid poor harvests in major producers. Regional losses must be assessed within world balances."],
    ["1972–1973","Unexpected import demand meets inventory pressure","Purchases by the Soviet Union and other economies changed international demand. Import growth alone does not prove hidden shortages."],
    ["1973–1974","Energy, policy and macroeconomic amplification","Energy costs and trade policies altered input costs and trade conditions. Multiple transmission channels mattered, not one harvest event."],
  ];
  return <section id="food-history" className="section food-system">
    <div className="section-no">HISTORICAL CONTEXT / NOT A FORECAST</div><h2>{zh?"1972–1974：为什么要同时看多条证据？":"Why 1972–1974 Matters"}</h2>
    <p>{zh?"这是历史机制的简要学习案例，不是当前局势的复刻判断，也不是校准过的历史相似度模型。":"A brief educational case about mechanisms—not a claim that current conditions repeat history or a calibrated similarity model."}</p>
    <ol className="fs-history">{events.map(([year,title,text])=><li className="fs-card" key={year}><span>{year}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
    <a href={source} target="_blank" rel="noreferrer">{zh?"USDA ERS：1970 年代粮价冲击回顾":"USDA ERS: agricultural price spikes in the 1970s"} ↗</a>
  </section>;
}

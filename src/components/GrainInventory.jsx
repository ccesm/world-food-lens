import React,{useState} from "react";
import {GRAINS,inventorySummary} from "../services/foodStress.js";
import {sourceStateLabel} from "../services/officialSources.js";
const names={zh:{wheat:"小麦",maize:"玉米",rice:"稻米（精米口径）"},en:{wheat:"Wheat",maize:"Maize",rice:"Rice (milled basis)"}};
const copy={
  zh:{title:"三种谷物，库存缓冲有何不同？",intro:"同一个库存比例，在不同作物上意义不同。与每种作物自身的历史比较；百分位越低，表示相对缓冲越薄，但并非供给危机概率。",scope:"统计口径",world:"全球",ex:"剔除中国",ratio:"库存消费比",rank:"历史百分位",reference:"对比期",change:"较上年",balance:"产量 − 消费",unit:"百万公吨",missing:"尚无完整的可比官方历史",note:"剔除中国：同时从全球库存与消费中减去中国值。这个对照不是可出口库存，不表示其他地区库存可自由交易。未把不同谷物相加为“总谷物”；最新市场年度包含预测，国家市场年度和历史覆盖可能不同。",detail:"观察价格传导",costNote:"短期能源和运费上升可能抬高投入成本；中期替代供应、贸易路线及化肥产能会调整；长期技术与能源替代可能改变依赖。冲突不意味着油价永久上涨。实时航道中断、运费与保险费尚未接入。",source:"USDA 数据与说明"},
  en:{title:"How do inventory buffers differ across grains?",intro:"The same ratio means different things for different crops. Compare each crop with its own history. A lower percentile indicates a thinner relative buffer, not a probability of shortage.",scope:"Geographic scope",world:"World",ex:"Excluding China",ratio:"Stocks-to-use",rank:"Historical percentile",reference:"Comparison period",change:"Year-on-year",balance:"Production − use",unit:"million metric tons",missing:"No complete comparable official history",note:"Ex-China subtracts China from both stocks and consumption. It is not exportable inventory or a claim that other stocks are freely tradable. Grains are not added into a total-cereal measure. Latest marketing years include forecasts; country marketing years and historical coverage can differ.",detail:"Read the transmission mechanism",costNote:"Short-run energy and freight shocks can raise inputs. Alternative supplies, routes and fertilizer capacity can adjust over the medium term; technology and energy substitution may change long-run dependence. Conflict does not mean oil rises forever. Live chokepoint disruptions, freight and insurance are not connected.",source:"USDA data and methodology"},
};
export default function GrainInventory({record,lang}) {
  const [scope,setScope]=useState("world"),t=copy[lang];
  return <div className="food-system grain-inventory">
    <h3 className="fs-subtitle">{t.title}</h3><p>{t.intro}</p>
    <label className="fs-control">{t.scope}<select aria-label={t.scope} value={scope} onChange={e=>setScope(e.target.value)}><option value="world">{t.world}</option><option value="excludingChina">{t.ex}</option></select></label>
    <div className="fs-summary">{GRAINS.map(key=>{const data=inventorySummary(record?.data?.grains?.[key],scope);return <article key={key} className="fs-card"><h3>{names[lang][key]}</h3>{data?<>
      <span>{t.ratio} · {data.current.year}</span><strong>{data.current.ratio.toFixed(1)}%</strong>
      <p>{t.rank}: <b>{data.percentile.toFixed(0)} / 100</b></p><meter min="0" max="100" value={data.percentile} aria-label={`${names[lang][key]} ${t.rank}`}/>
      <small>{t.reference}: {data.referenceStart}–{data.referenceEnd} · n={data.count}</small>
      <p>{t.change}: {(data.current.ratio-data.previous.ratio).toFixed(1)} pp<br/>{t.balance}: {((data.current.production-data.current.consumption)/1000).toFixed(1)} {t.unit}</p>
    </>:<p>{t.missing}</p>}</article>})}</div>
    <p className="fs-notice">{t.note}</p><div className="fs-provenance"><a href={record?.source?.url??"https://apps.fas.usda.gov/psdonline/"} target="_blank" rel="noreferrer">{t.source} ↗</a><span>{sourceStateLabel(record,lang)}</span><span>{record?.fetchedAt??"—"}</span></div>
    <details className="fs-details"><summary>{t.detail}</summary><p>{t.costNote}</p></details>
  </div>;
}

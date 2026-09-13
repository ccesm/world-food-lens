import React,{useState} from "react";
import {guideCopy,logicNodes,guideExamples} from "../data/homeGuide.js";
import "../home.css";

export function HomeHero({lang,model,children}) {
  const t=guideCopy[lang];
  const levels={zh:{low:"低",moderate:"中等",elevated:"偏高",high:"高",critical:"严重"},en:{low:"Low",moderate:"Moderate",elevated:"Elevated",high:"High",critical:"Critical"}};
  return <section className="home-hero" id="home">
    <div className="eyebrow">{t.identity}</div><h1>World Food Lens</h1><p className="home-subtitle">{t.subtitle}</p>
    <p className="home-description">{t.description}</p>
    <div className="home-current"><span>{t.current}</span><strong>{model.score===null?t.unknown:`${model.score.toFixed(1)} / 100 · ${levels[lang][model.level]}`}</strong><small>{t.coverage}: {model.coverage}% · {t.caveat}</small></div>
    <div className="home-ctas"><a className="home-primary" href="#food-stress">{t.primary} ↓</a><a href="#how-it-works">{t.secondary} ↗</a></div>
    {children}
  </section>;
}

export default function HomeOrientation({lang}) {
  const t=guideCopy[lang],[selected,setSelected]=useState("weather");
  const node=logicNodes.find(n=>n.id===selected);
  return <section id="how-it-works" className="home-orientation">
    <div className="home-core"><span className="eyebrow">{t.question}</span><h2>{t.core}</h2><p>{t.principle}</p></div>
    <details className="home-logic" open><summary><span>{t.flowTitle}</span></summary>
      <p>{t.flowHint}</p><ol className="home-flow">{logicNodes.map((n,i)=><li key={n.id}><button aria-pressed={selected===n.id} aria-controls="logic-explanation" onClick={()=>setSelected(n.id)}><small>{String(i+1).padStart(2,"0")}</small>{n[lang][0]}</button></li>)}</ol>
      <div className="home-node" id="logic-explanation" aria-live="polite"><h3>{node[lang][0]}</h3><p>{node[lang][1]}</p><small>{t.status}: {node[lang][2]}</small>
        {guideExamples[node.id]&&<details key={node.id}><summary>{guideExamples[node.id][lang].title}</summary><ul>{guideExamples[node.id][lang].items.map(item=><li key={item}>{item}</li>)}</ul></details>}
        <a href={`#${node.target}`}>{t.go} ↗</a></div>
    </details>
    <details className="home-five"><summary>{t.fiveTitle}</summary><ol>{t.questions.map((q,i)=><li key={i}><span>{i+1}</span>{q}</li>)}</ol><p>{t.fiveNote}</p></details>
    <details className="home-reading"><summary>{t.reading}</summary><p>{t.readIntro}</p><ol>{t.steps.map((step,i)=><li key={step}><a href={`#${t.stepTargets[i]}`}>{step} ↗</a></li>)}</ol></details>
  </section>;
}

import React,{useEffect,useState} from "react";
import {mobileClimateNavigation,mobileMoreNavigation,mobilePrimaryNavigation} from "../data/mobileNavigation.js";

export default function MobileNavigation({lang}){
  const [panel,setPanel]=useState(null),items=panel==="climate"?mobileClimateNavigation:mobileMoreNavigation;
  const close=()=>setPanel(null);
  useEffect(()=>{
    const onKey=event=>{if(event.key==="Escape")close();};
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);
  return <>
    {panel&&<div id={`mobile-${panel}-menu`} className="mobile-nav-panel" role="dialog" aria-label={panel==="climate"?(lang==="zh"?"气候功能":"Climate features"):(lang==="zh"?"更多页面":"More sections")}>
      <div className="mobile-nav-panel-head"><b>{panel==="climate"?(lang==="zh"?"气候":"Climate"):(lang==="zh"?"更多":"More")}</b><button type="button" onClick={close} aria-label={lang==="zh"?"关闭菜单":"Close menu"}>×</button></div>
      <div className="mobile-nav-panel-list">{items.map(item=>item.href?<a key={item.href} href={item.href} onClick={close}>{item.label[lang]}</a>:<span key={item.label.en} aria-disabled="true"><b>{item.label[lang]}</b><small>{item.status[lang]}</small></span>)}</div>
    </div>}
    <nav className="mobile-nav" aria-label={lang==="zh"?"手机主导航":"Mobile primary navigation"}>{mobilePrimaryNavigation.map(item=>item.href?<a key={item.id} href={item.href} onClick={close}>{item.label[lang]}</a>:<button key={item.id} type="button" aria-expanded={panel===item.panel} aria-controls={`mobile-${item.panel}-menu`} onClick={()=>setPanel(current=>current===item.panel?null:item.panel)}>{item.label[lang]}<span aria-hidden="true">{panel===item.panel?"▴":"▾"}</span></button>)}</nav>
  </>;
}

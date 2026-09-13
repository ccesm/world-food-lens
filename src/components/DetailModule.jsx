import React,{useEffect,useRef,useState} from "react";

// Native disclosure keeps all original section IDs reachable, including a URL
// opened directly at a nested anchor. Children stay mounted to preserve filters.
export default function DetailModule({id,title,description,anchorPrefix,children}) {
  const ref=useRef(null),[visited,setVisited]=useState(false);
  useEffect(()=>{
    const reveal=()=>{
      let target,hash;
      try{hash=decodeURIComponent(location.hash.slice(1));target=document.getElementById(hash);}catch{return;}
      // Known nested anchors (policy headings) must mount before lookup succeeds.
      if(!target&&(hash===`${id}-content`||(anchorPrefix&&hash.startsWith(anchorPrefix)))){
        ref.current.open=true;setVisited(true);return;
      }
      if(target && ref.current?.contains(target)) {
        ref.current.open=true;
        setVisited(true);
        requestAnimationFrame(()=>target.scrollIntoView({block:"start"}));
      }
    };
    // The outer ID is present before charts mount; links retain their old IDs.
    const onClick=event=>{
      const anchor=event.target.closest?.('a[href^="#"]');
      if(anchor?.hash===`#${id}`||(anchorPrefix&&anchor?.hash.startsWith(`#${anchorPrefix}`))){ref.current.open=true;setVisited(true);}
    };
    reveal();window.addEventListener("hashchange",reveal);document.addEventListener("click",onClick);
    return ()=>{window.removeEventListener("hashchange",reveal);document.removeEventListener("click",onClick);};
  },[id,anchorPrefix,visited]);
  return <details id={id} ref={ref} className="detail-module" onToggle={event=>{if(event.currentTarget.open)setVisited(true);}}>
    <summary><span>{title}</span><small>{description}</small></summary>
    {visited&&<div className="detail-module-content">{children}</div>}
  </details>;
}

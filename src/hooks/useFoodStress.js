import {useEffect,useMemo,useState} from "react";
import {buildFoodStress} from "../services/foodStress.js";

// One clock and one calculation shared by the hero and full evidence view.
export default function useFoodStress(bundle) {
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return ()=>clearInterval(timer);},[]);
  return useMemo(()=>buildFoodStress(bundle,now),[bundle,now]);
}

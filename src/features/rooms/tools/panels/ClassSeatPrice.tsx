import {useEffect,useRef,useState} from "react";
import type {RoomToolsCommand} from "../roomTools.types";
const format=(cents:number)=>(cents/100).toFixed(2).replace(".",",");
export default function ClassSeatPrice({cents,disabled,execute}:{cents:number;disabled:boolean;execute:(command:RoomToolsCommand)=>Promise<unknown>}) {
 const [value,setValue]=useState(()=>format(cents)),[error,setError]=useState(""),[saving,setSaving]=useState(false);
 const pending=useRef(false);
 useEffect(()=>{setValue(format(cents));},[cents]);
 const save=async()=>{
  if(pending.current||disabled)return;
  const text=value.trim().replace(",",".");
  const next=Math.round(Number(text)*100);
  if(!/^\d{1,4}(\.\d{1,2})?$/.test(text)||next>100000){setError("Indiquez un prix entre 0 et 1 000 €, avec deux décimales maximum.");return;}
  setError("");setValue(format(next));if(next===cents)return;
  pending.current=true;setSaving(true);
  try{await execute({type:"classe.seat.price",cents:next});}catch{setError("Le prix n’a pas été enregistré. Réessayez.");}finally{pending.current=false;setSaving(false);}
 };
 return <div className="classroom-seat-price"><label><span>Prix d’une place</span><span className="classroom-seat-price__display"><input aria-label="Prix d’une place" type="text" inputMode="decimal" value={value} disabled={disabled||saving} aria-invalid={Boolean(error)} onChange={e=>setValue(e.target.value)} onBlur={()=>void save()} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();}}}/><span aria-hidden="true">€</span></span></label>{error?<small role="alert">{error}</small>:saving?<small role="status">Enregistrement…</small>:null}</div>;
}

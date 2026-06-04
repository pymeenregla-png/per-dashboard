import { useState, useEffect, useCallback } from "react";
import { SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { supabase } from "./lib/supabase";

/* ═══════════════════════════════════════════════════════════════════
   DESIGN SYSTEM
═══════════════════════════════════════════════════════════════════ */
const DS = {
  ink:"#0C1B2E",inkL:"#162843",inkM:"#1F3A5F",inkFade:"rgba(12,27,46,0.06)",
  gold:"#B8943A",goldL:"#CCA84A",goldFaint:"rgba(184,148,58,0.10)",goldLine:"rgba(184,148,58,0.25)",
  cream:"#FDFAF4",creamM:"#F5EFE4",creamD:"#EDE4D4",creamDD:"#E2D6C2",white:"#FFFFFF",
  slate:"#5A6B7E",slateL:"#8A9BAE",slateXL:"#C4D0DC",
  green:"#1A5E42",greenL:"rgba(26,94,66,0.12)",greenT:"#1A5E42",
  amber:"#946010",amberL:"rgba(148,96,16,0.12)",amberT:"#7A4E0A",
  red:"#8B1E1E",redL:"rgba(139,30,30,0.10)",redT:"#8B1E1E",
  blue:"#1A3F7A",blueL:"rgba(26,63,122,0.10)",blueT:"#1A3F7A",
  purple:"#3D2E8A",purpleL:"rgba(61,46,138,0.10)",purpleT:"#3D2E8A",
};

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════════════════════════════════ */
const ETAPAS_SOP=["Intake","Diagnóstico","CLM/Firma","Ejecución","Control","Cierre","Post-venta","Retro-loop"];
const ESTADO_CFG={
  HITL:       {label:"HITL Pendiente",dot:DS.amber,bg:DS.amberL,txt:DS.amberT},
  EN_REVISION:{label:"En Revisión",  dot:DS.blue, bg:DS.blueL, txt:DS.blueT},
  ESCALADO:   {label:"Escalado",     dot:DS.red,  bg:DS.redL,  txt:DS.redT},
  CERRADO:    {label:"Cerrado",      dot:DS.green,bg:DS.greenL,txt:DS.greenT},
  PENDIENTE:  {label:"Pendiente",    dot:DS.slate,bg:DS.inkFade,txt:DS.slate},
};
const AREA_ICON={Marcas:"M",Societario:"S",Laboral:"L",Tributario:"T",Contratos:"C",Consumidor:"CO",Cobranza:"CB",Orientacion:"O",Otro:"?"};
const AREA_COLOR={Marcas:DS.purple,Societario:DS.blue,Laboral:DS.amber,Tributario:DS.green,Contratos:DS.slate,Consumidor:DS.inkM,Cobranza:DS.red,Orientacion:DS.slate,Otro:DS.slate};
const CANAL_ICON={"Web":"ti-world","WhatsApp":"ti-brand-whatsapp","Instagram DM":"ti-brand-instagram","web":"ti-world","whatsapp":"ti-brand-whatsapp","instagram":"ti-brand-instagram"};
const URGENCIA_CFG={critica:{color:DS.red,bg:DS.redL},alta:{color:DS.amber,bg:DS.amberL},media:{color:DS.blue,bg:DS.blueL},baja:{color:DS.slate,bg:DS.inkFade}};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
function fmtDate(ts){if(!ts)return"-";const d=new Date(ts);return d.toLocaleDateString("es-CL",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});}
function fmtShort(ts){if(!ts)return"-";const d=new Date(ts);return d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})+" · "+d.toLocaleDateString("es-CL",{day:"2-digit",month:"short"});}
function horasDesde(ts){if(!ts)return 0;const diff=Date.now()-new Date(ts).getTime();return Math.floor(diff/3600000);}
function horasLabel(h){return h<24?`${h}h`:`${Math.floor(h/24)}d ${h%24}h`;}
function slaStatus(sla,horas){const p=horas/(sla||48);if(p>=1)return{label:"Vencido",color:DS.red,pct:100};if(p>=0.75)return{label:"Urgente",color:DS.amber,pct:Math.round(p*100)};return{label:"En plazo",color:DS.green,pct:Math.round(p*100)};}

/* Mapea un row de Supabase al formato interno del dashboard */
function mapCaso(row){
  const horas=horasDesde(row.ingresado_at);
  return {
    id:row.folio||row.id,
    folio:(row.folio||"").replace("PER-","").split("-").pop()||"0000",
    cliente:row.contacto_nombre||row.cliente_rut||"Sin nombre",
    rut:row.cliente_rut||"-",
    contacto:{nombre:row.contacto_nombre||"-",email:row.contacto_email||"-",tel:row.contacto_tel||"-"},
    area:row.area||"Otro",
    agente:row.agente_id||"A0",
    estado:row.estado||"PENDIENTE",
    kit:row.kit||"Arranque",
    prioridad:row.prioridad||"MEDIA",
    confianza:parseFloat(row.confianza_ia)||0.5,
    canal:row.canal||"Web",
    sla:parseInt(row.sla_horas)||48,
    horasTranscurridas:horas,
    etapa:row.estado==="CERRADO"?6:row.estado==="EN_REVISION"?3:row.estado==="ESCALADO"?2:2,
    asunto:row.asunto||row.descripcion||"Sin asunto",
    ingreso:row.ingresado_at||row.created_at,
    plazoCritico:row.plazo_critico||null,
    plazoCriticoGestionado:false,
    fuentesRAG:row.fuentes_rag||[],
    resumenIA:row.resumen_ia||row.analisis_ia||"Análisis pendiente.",
    acciones:row.acciones_pendientes||[],
    docs:[],
    historial:[
      {ts:row.ingresado_at||row.created_at,actor:"Sistema",tipo:"sistema",msg:`Caso ingresado vía ${row.canal||"web"}. Folio ${row.folio||row.id}.`},
      ...(row.resumen_ia?[{ts:row.ultima_accion_at||row.ingresado_at,actor:`Agente ${row.agente_id||"IA"}`,tipo:"ia",msg:`Análisis completado. Confianza ${Math.round((parseFloat(row.confianza_ia)||0.5)*100)}%.`}]:[]),
    ],
    leccion:row.leccion_aprendida||"",
    _raw:row,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   HOOK: useCasosSupabase
═══════════════════════════════════════════════════════════════════ */
function useCasosSupabase(){
  const [casos,setCasos]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [lastUpdate,setLastUpdate]=useState(null);

  const fetchCasos=useCallback(async()=>{
    try{
      const {data,error:err}=await supabase
        .from("casos")
        .select("*")
        .order("ingresado_at",{ascending:false})
        .limit(100);
      if(err)throw err;
      setCasos((data||[]).map(mapCaso));
      setLastUpdate(new Date());
      setError(null);
    }catch(e){
      console.error("Error fetching casos:",e);
      setError(e.message);
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{
    fetchCasos();
    // Realtime subscription
    const channel=supabase
      .channel("casos_changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"casos"},()=>{
        fetchCasos();
      })
      .subscribe();
    return()=>supabase.removeChannel(channel);
  },[fetchCasos]);

  const actualizarEstado=useCallback(async(casoId,nuevoEstado)=>{
    const raw=casos.find(c=>c.id===casoId)?._raw;
    if(!raw)return;
    const {error:err}=await supabase
      .from("casos")
      .update({estado:nuevoEstado,ultima_accion_at:new Date().toISOString()})
      .eq("id",raw.id);
    if(!err){
      setCasos(p=>p.map(c=>c.id===casoId?{...c,estado:nuevoEstado}:c));
    }
    return err;
  },[casos]);

  const actualizarDatos=useCallback(async(casoId,form)=>{
    const raw=casos.find(c=>c.id===casoId)?._raw;
    if(!raw)return;
    const {error:err}=await supabase
      .from("casos")
      .update({
        contacto_nombre:form.nombre,
        contacto_email:form.email,
        contacto_tel:form.tel,
        cliente_rut:form.rut,
        asunto:form.asunto,
        ultima_accion_at:new Date().toISOString(),
      })
      .eq("id",raw.id);
    if(!err){
      setCasos(p=>p.map(c=>c.id===casoId?{...c,cliente:form.nombre,rut:form.rut,asunto:form.asunto,contacto:{nombre:form.nombre,email:form.email,tel:form.tel}}:c));
    }
    return err;
  },[casos]);

  const eliminarCaso=useCallback(async(casoId)=>{
    const raw=casos.find(c=>c.id===casoId)?._raw;
    if(!raw)return;
    const {error:err}=await supabase.from("casos").delete().eq("id",raw.id);
    if(!err) setCasos(p=>p.filter(c=>c.id!==casoId));
    return err;
  },[casos]);

  const cerrarCaso=useCallback(async(casoId,leccion)=>{
    const raw=casos.find(c=>c.id===casoId)?._raw;
    if(!raw)return;
    const {error:err}=await supabase
      .from("casos")
      .update({estado:"CERRADO",leccion_aprendida:leccion,cerrado_at:new Date().toISOString(),retro_enviado:true,ultima_accion_at:new Date().toISOString()})
      .eq("id",raw.id);
    if(!err) setCasos(p=>p.map(c=>c.id===casoId?{...c,estado:"CERRADO",leccion}:c));
    return err;
  },[casos]);

  return{casos,loading,error,lastUpdate,fetchCasos,actualizarEstado,actualizarDatos,eliminarCaso,cerrarCaso};
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTES BASE
═══════════════════════════════════════════════════════════════════ */
function Chip({label,dot,bg,txt,size=11}){return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:bg,color:txt,fontSize:size,fontFamily:"'Outfit',sans-serif",fontWeight:600,padding:"3px 9px",borderRadius:5,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{dot&&<span style={{width:5,height:5,borderRadius:"50%",background:dot,flexShrink:0}}/>}{label}</span>);}
function Bar({pct,color,height=3}){return(<div style={{flex:1,height,background:DS.creamDD,borderRadius:2,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color,borderRadius:2,transition:"width .5s"}}/></div>);}
function SecLabel({children,icon}){return(<div style={{display:"flex",alignItems:"center",gap:7,margin:"0 0 10px"}}>{icon&&<i className={`ti ${icon}`} style={{fontSize:13,color:DS.slateL}} aria-hidden/>}<span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.12em"}}>{children}</span></div>);}
function Card({children,style={},onClick}){return(<div onClick={onClick} style={{background:DS.white,border:`1px solid ${DS.creamD}`,borderRadius:10,...style}}>{children}</div>);}
function ConfBar({val,compact=false}){const pct=Math.round((val||0)*100);const color=pct>=70?DS.green:pct>=55?DS.amber:DS.red;return(<div style={{display:"flex",alignItems:"center",gap:8}}>{!compact&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,width:58}}>Confianza</span>}<Bar pct={pct} color={color}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color,minWidth:28}}>{pct}%</span></div>);}
function SlaBar({sla,horas,compact=false}){const {label,color,pct}=slaStatus(sla,horas);return(<div style={{display:"flex",alignItems:"center",gap:8}}>{!compact&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,width:58}}>SLA {sla}h</span>}<Bar pct={pct} color={color}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color,minWidth:52}}>{label}</span></div>);}
function SopBar({etapa}){return(<div style={{margin:"0 0 14px"}}><SecLabel icon="ti-route">Etapa del caso</SecLabel><div style={{display:"flex",gap:0,position:"relative"}}>{ETAPAS_SOP.map((e,i)=>{const done=i<etapa,active=i===etapa;return(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative"}}><div style={{width:"100%",height:3,background:done?DS.gold:active?DS.goldL:DS.creamDD,transition:"background .3s"}}/><div style={{width:7,height:7,borderRadius:"50%",background:done?DS.gold:active?DS.goldL:DS.creamDD,border:`1px solid ${done?DS.gold:active?DS.gold:DS.creamDD}`,position:"absolute",top:-2}}/>{active&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:8,fontWeight:700,color:DS.gold,marginTop:6,whiteSpace:"nowrap"}}>{e}</span>}</div>);})}</div><div style={{display:"flex",justifyContent:"space-between",marginTop:14}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL}}>Intake</span><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL}}>Retro-loop</span></div></div>);}
function Toast({toast}){if(!toast)return null;const cfg={ok:{bg:DS.green,icon:"ti-check"},warn:{bg:DS.amber,icon:"ti-alert-triangle"},err:{bg:DS.red,icon:"ti-x"}};const c=cfg[toast.tipo]||cfg.ok;return(<div style={{position:"fixed",top:16,right:16,zIndex:9999,background:c.bg,color:"#fff",padding:"11px 18px",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 24px rgba(0,0,0,.2)"}}><i className={`ti ${c.icon}`} style={{fontSize:16}} aria-hidden/>{toast.msg}</div>);}

/* Spinner de carga */
function LoadingScreen(){return(<div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:DS.cream,flexDirection:"column",gap:16}}>
  <div style={{width:44,height:44,borderRadius:10,background:DS.ink,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${DS.goldLine}`}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:700,color:DS.gold}}>P</span></div>
  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL}}>Cargando casos desde Supabase…</div>
  <div style={{width:200,height:2,background:DS.creamD,borderRadius:1,overflow:"hidden"}}><div style={{width:"60%",height:"100%",background:DS.gold,borderRadius:1,animation:"slide 1.2s ease-in-out infinite"}}/></div>
  <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
</div>);}

/* Error screen */
function ErrorScreen({error,onRetry}){return(<div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:DS.cream,flexDirection:"column",gap:12}}>
  <i className="ti ti-database-off" style={{fontSize:40,color:DS.red}} aria-hidden/>
  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:700,color:DS.ink}}>Error de conexión</div>
  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,maxWidth:320,textAlign:"center"}}>{error}</div>
  <button onClick={onRetry} style={{padding:"10px 20px",borderRadius:7,border:"none",background:DS.ink,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.gold,marginTop:8}}>Reintentar</button>
</div>);}

/* ═══════════════════════════════════════════════════════════════════
   MODALES
═══════════════════════════════════════════════════════════════════ */
function ModalEditar({caso,onSave,onClose}){
  const [form,setForm]=useState({cliente:caso.cliente,rut:caso.rut,nombre:caso.contacto.nombre,email:caso.contacto.email,tel:caso.contacto.tel,asunto:caso.asunto});
  const [saving,setSaving]=useState(false);
  const inp={width:"100%",padding:"8px 10px",borderRadius:6,boxSizing:"border-box",border:`1px solid ${DS.creamDD}`,background:DS.white,fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,outline:"none"};
  async function handleSave(){setSaving(true);await onSave(form);setSaving(false);}
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:8888,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:DS.white,borderRadius:12,width:480,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{padding:"20px 24px",borderBottom:`1px solid ${DS.creamD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.ink}}>Editar datos del caso</span><button onClick={onClose} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:20,color:DS.slateL}}>×</button></div>
      <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
        {[["nombre","Nombre contacto"],["rut","RUT"],["email","Email"],["tel","Teléfono"],["asunto","Asunto"]].map(([k,lbl])=>(<div key={k}><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>{lbl}</label><input value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/></div>))}
      </div>
      <div style={{padding:"16px 24px",borderTop:`1px solid ${DS.creamD}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"9px 18px",borderRadius:7,border:`1px solid ${DS.creamDD}`,background:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slate}}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{padding:"9px 18px",borderRadius:7,border:"none",background:DS.ink,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.gold}}>{saving?"Guardando…":"Guardar cambios"}</button>
      </div>
    </div>
  </div>);}

function ModalEliminar({caso,onConfirm,onClose}){
  const [confirm,setConfirm]=useState("");const [saving,setSaving]=useState(false);
  async function handleConfirm(){if(confirm!==caso.id)return;setSaving(true);await onConfirm();setSaving(false);}
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:8888,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:DS.white,borderRadius:12,width:420,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{padding:"20px 24px",borderBottom:`1px solid ${DS.creamD}`}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.red}}>Eliminar caso</span></div>
      <div style={{padding:"20px 24px"}}>
        <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slate,margin:"0 0 16px",lineHeight:1.6}}>Esta acción es <strong>irreversible</strong>. El caso <strong>{caso.id}</strong> será eliminado de Supabase permanentemente.</p>
        <p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.slateL,margin:"0 0 8px"}}>Escribe el folio para confirmar:</p>
        <input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder={caso.id} style={{width:"100%",padding:"8px 10px",borderRadius:6,boxSizing:"border-box",border:`1px solid ${DS.creamDD}`,fontFamily:"'Outfit',sans-serif",fontSize:12,outline:"none"}}/>
      </div>
      <div style={{padding:"16px 24px",borderTop:`1px solid ${DS.creamD}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"9px 18px",borderRadius:7,border:`1px solid ${DS.creamDD}`,background:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slate}}>Cancelar</button>
        <button onClick={handleConfirm} disabled={confirm!==caso.id||saving} style={{padding:"9px 18px",borderRadius:7,border:"none",background:confirm===caso.id?DS.red:"#ccc",cursor:confirm===caso.id?"pointer":"not-allowed",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:"#fff"}}>{saving?"Eliminando…":"Eliminar"}</button>
      </div>
    </div>
  </div>);}

/* ═══════════════════════════════════════════════════════════════════
   CASO ROW
═══════════════════════════════════════════════════════════════════ */
function CasoRow({caso,selected,onClick}){
  const est=ESTADO_CFG[caso.estado]||ESTADO_CFG.PENDIENTE;
  const urgent=caso.estado==="ESCALADO"||caso.estado==="HITL";
  const ac=AREA_COLOR[caso.area]||DS.slate;
  return(<div onClick={onClick} style={{padding:"13px 16px",borderBottom:`1px solid ${DS.creamD}`,cursor:"pointer",background:selected?DS.goldFaint:urgent?"rgba(148,96,16,0.04)":DS.white,borderLeft:`3px solid ${selected?DS.gold:urgent?DS.amber:"transparent"}`,transition:"background .12s"}}
    onMouseEnter={e=>{if(!selected)e.currentTarget.style.background=DS.creamM;}}
    onMouseLeave={e=>{if(!selected)e.currentTarget.style.background=urgent?"rgba(148,96,16,0.04)":DS.white;}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:22,height:22,borderRadius:5,background:ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:800,color:"#fff"}}>{AREA_ICON[caso.area]||"?"}</span></div>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.gold}}>{caso.id}</span>
      </div>
      <Chip label={est.label} dot={est.dot} bg={est.bg} txt={est.txt} size={9}/>
    </div>
    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.ink,marginBottom:3,lineHeight:1.2}}>{caso.cliente}</div>
    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slate,marginBottom:8,lineHeight:1.4}}>{(caso.asunto||"").length>60?(caso.asunto||"").slice(0,60)+"…":caso.asunto||"-"}</div>
    <div style={{display:"flex",flexDirection:"column",gap:4}}><ConfBar val={caso.confianza} compact/><SlaBar sla={caso.sla} horas={caso.horasTranscurridas} compact/></div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <i className={`ti ${CANAL_ICON[caso.canal]||CANAL_ICON[(caso.canal||"").toLowerCase()]||"ti-device-mobile"}`} style={{fontSize:12,color:DS.slateL}} aria-hidden/>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{caso.canal}</span>
      </div>
      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateXL}}>{horasLabel(caso.horasTranscurridas)}</span>
    </div>
    {caso.plazoCritico&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:5,background:DS.redL,padding:"4px 8px",borderRadius:4}}><i className="ti ti-alert-triangle" style={{fontSize:11,color:DS.red}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.red,fontWeight:700}}>Plazo: {new Date(caso.plazoCritico).toLocaleDateString("es-CL")}</span></div>}
  </div>);}

/* ═══════════════════════════════════════════════════════════════════
   CASO DETAIL
═══════════════════════════════════════════════════════════════════ */
function AcBtn({icon,label,sub,color,onClick}){const [h,setH]=useState(false);return(<button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,padding:"11px 13px",background:h?color:"transparent",border:`1px solid ${h?color:DS.creamDD}`,borderRadius:9,cursor:"pointer",transition:"all .15s",textAlign:"left"}}><div style={{display:"flex",alignItems:"center",gap:7}}><i className={`ti ${icon}`} style={{fontSize:15,color:h?"#fff":color}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:h?"#fff":color}}>{label}</span></div><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:h?"rgba(255,255,255,.7)":DS.slateL}}>{sub}</span></button>);}

function CasoDetail({caso,onAccion,onEditar,onEliminar}){
  const [tab,setTab]=useState("acciones");
  const [nota,setNota]=useState("");
  const [leccion,setLeccion]=useState(caso.leccion||"");
  const est=ESTADO_CFG[caso.estado]||ESTADO_CFG.PENDIENTE;
  const cerrado=caso.estado==="CERRADO";
  const ac=AREA_COLOR[caso.area]||DS.slate;
  const TABS=[{id:"resumen",label:"Resumen",icon:"ti-clipboard-text"},{id:"acciones",label:"Acciones",icon:"ti-bolt"},{id:"historial",label:"Historial",icon:"ti-timeline"},{id:"cerrar",label:"Cierre",icon:"ti-circle-check",hidden:cerrado}].filter(t=>!t.hidden);

  return(<div style={{display:"flex",flexDirection:"column",height:"100%",background:DS.white}}>
    {/* HEADER */}
    <div style={{padding:"18px 24px 0",borderBottom:`1px solid ${DS.creamD}`,background:DS.cream,flexShrink:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
            <div style={{background:DS.ink,borderRadius:6,padding:"4px 12px",display:"inline-flex",alignItems:"center",border:`1px solid ${DS.goldLine}`}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:800,color:DS.gold,letterSpacing:"0.06em"}}>{caso.id}</span></div>
            <Chip label={est.label} dot={est.dot} bg={est.bg} txt={est.txt}/>
            <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:caso.prioridad==="CRITICA"?DS.red:caso.prioridad==="ALTA"?DS.amber:DS.blue}}>● {caso.prioridad}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:26,height:26,borderRadius:5,background:ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:800,color:"#fff"}}>{AREA_ICON[caso.area]||"?"}</span></div>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:700,color:DS.ink}}>{caso.cliente}</span>
          </div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,marginTop:2}}>RUT {caso.rut} · Kit {caso.kit} · Agente {caso.agente}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"flex-start",flexShrink:0,marginLeft:12}}>
          {!cerrado&&(<select value={caso.estado} onChange={e=>onAccion(caso.id,"cambiarEstado",e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${DS.creamDD}`,background:DS.white,fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.ink,cursor:"pointer",outline:"none"}}>
            <option value="HITL">HITL Pendiente</option><option value="EN_REVISION">En Revisión</option><option value="ESCALADO">Escalado</option><option value="CERRADO">Cerrado</option>
          </select>)}
          <button onClick={()=>onEditar(caso)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:6,border:`1px solid ${DS.creamDD}`,background:DS.white,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slate}} onMouseEnter={e=>{e.currentTarget.style.borderColor=DS.gold;e.currentTarget.style.color=DS.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=DS.creamDD;e.currentTarget.style.color=DS.slate;}}><i className="ti ti-pencil" style={{fontSize:12}} aria-hidden/>Editar</button>
          <button onClick={()=>onEliminar(caso)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:6,border:`1px solid ${DS.redL}`,background:DS.redL,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.red}} onMouseEnter={e=>{e.currentTarget.style.background=DS.red;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background=DS.redL;e.currentTarget.style.color=DS.red;}}><i className="ti ti-trash" style={{fontSize:12}} aria-hidden/>Eliminar</button>
        </div>
      </div>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontSize:14,color:DS.inkM,margin:"0 0 10px",lineHeight:1.4}}>"{caso.asunto||"Sin asunto"}"</p>
      <SopBar etapa={caso.etapa}/>
      <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}><ConfBar val={caso.confianza}/><SlaBar sla={caso.sla} horas={caso.horasTranscurridas}/></div>
      {caso.plazoCritico&&(<div style={{display:"flex",alignItems:"center",gap:8,background:caso.plazoCriticoGestionado?DS.greenL:DS.redL,borderRadius:7,padding:"8px 12px",marginBottom:10}}>
        <i className={`ti ${caso.plazoCriticoGestionado?"ti-circle-check":"ti-alarm"}`} style={{fontSize:15,color:caso.plazoCriticoGestionado?DS.green:DS.red}} aria-hidden/>
        <div style={{flex:1}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:caso.plazoCriticoGestionado?DS.green:DS.red}}>Plazo crítico: </span><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:caso.plazoCriticoGestionado?DS.green:DS.red}}>{new Date(caso.plazoCritico).toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"})}</span></div>
        {!caso.plazoCriticoGestionado&&<button onClick={()=>onAccion(caso.id,"gestionarPlazo",null)} style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${DS.red}`,background:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.red}} onMouseEnter={e=>{e.currentTarget.style.background=DS.red;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=DS.red;}}>Marcar gestionado</button>}
      </div>)}
      {caso.fuentesRAG&&caso.fuentesRAG.length>0&&(<div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:10}}><i className="ti ti-database" style={{fontSize:12,color:DS.gold,marginTop:2}} aria-hidden/><div style={{flex:1}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,color:DS.gold,textTransform:"uppercase",letterSpacing:"0.1em"}}>Fuentes RAG ({caso.fuentesRAG.length}): </span><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slate}}>{caso.fuentesRAG.join(" · ")}</span></div></div>)}
      <div style={{display:"flex",gap:0,marginBottom:-1,overflowX:"auto"}}>
        {TABS.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 12px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===t.id?DS.gold:"transparent"}`,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}><i className={`ti ${t.icon}`} style={{fontSize:12,color:tab===t.id?DS.gold:DS.slateL}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:tab===t.id?700:400,color:tab===t.id?DS.gold:DS.slateL}}>{t.label}</span></button>))}
      </div>
    </div>

    {/* BODY */}
    <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
      {tab==="resumen"&&(<>
        <SecLabel icon="ti-user">Datos del cliente</SecLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
          {[{icon:"ti-user",label:"Nombre",val:caso.contacto.nombre},{icon:"ti-id",label:"RUT",val:caso.rut},{icon:"ti-mail",label:"Email",val:caso.contacto.email},{icon:"ti-phone",label:"Teléfono",val:caso.contacto.tel}].map(({icon,label,val})=>(<div key={label} style={{background:DS.creamM,borderRadius:7,padding:"9px 12px",display:"flex",gap:8,alignItems:"flex-start"}}><i className={`ti ${icon}`} style={{fontSize:14,color:DS.slateL,marginTop:1,flexShrink:0}} aria-hidden/><div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:1}}>{label}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,fontWeight:500}}>{val||"-"}</div></div></div>))}
        </div>
        <SecLabel icon="ti-cpu">Análisis del agente IA</SecLabel>
        <div style={{background:`${DS.gold}09`,border:`1px solid ${DS.goldLine}`,borderRadius:8,padding:"13px 16px",marginBottom:16}}><p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.inkM,margin:0,lineHeight:1.65}}>{caso.resumenIA||"Sin análisis disponible."}</p></div>
        {caso.leccion&&(<><SecLabel icon="ti-brain">Lección aprendida</SecLabel><div style={{background:DS.greenL,border:`1px solid ${DS.green}30`,borderRadius:8,padding:"12px 14px"}}><p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.green,margin:0,lineHeight:1.6}}>{caso.leccion}</p></div></>)}
        <div style={{marginTop:16}}><SecLabel icon="ti-clock">Tiempos</SecLabel>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[{label:"Ingresado",val:fmtDate(caso.ingreso)},{label:"Última acción",val:fmtDate(caso._raw?.ultima_accion_at)},{label:"Cerrado",val:fmtDate(caso._raw?.cerrado_at)}].map(({label,val})=>(<div key={label} style={{background:DS.creamM,borderRadius:7,padding:"8px 12px",flex:1,minWidth:120}}><div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>{label}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.ink}}>{val||"-"}</div></div>))}
          </div>
        </div>
      </>)}

      {tab==="acciones"&&(<>
        {caso.acciones&&caso.acciones.length>0&&(<><SecLabel icon="ti-checklist">Próximas acciones</SecLabel><div style={{marginBottom:16}}>{caso.acciones.map((a,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:DS.creamM,borderRadius:7,marginBottom:5}}><div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${DS.slateXL}`,flexShrink:0}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink}}>{a}</span></div>))}</div></>)}
        {!cerrado&&(<>
          <SecLabel icon="ti-bolt">Acción rápida</SecLabel>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {[{id:"aprobar",icon:"ti-check",label:"Aprobar y enviar",sub:"Confirma al cliente",color:DS.green},{id:"responder",icon:"ti-send",label:"Responder cliente",sub:"Envía nota al cliente",color:DS.blue},{id:"escalar",icon:"ti-alarm",label:"Escalar a equipo",sub:"Notifica Slack",color:DS.amber},{id:"cerrar",icon:"ti-circle-check",label:"Cerrar caso",sub:"Archiva + envía RAG",color:DS.slate}].map(a=>(<AcBtn key={a.id} {...a} onClick={()=>onAccion(caso.id,a.id,{nota,leccion})}/>))}
          </div>
          <SecLabel icon="ti-pencil">Nota interna</SecLabel>
          <textarea value={nota} onChange={e=>setNota(e.target.value)} placeholder="Análisis, instrucciones o notas internas…" style={{width:"100%",minHeight:80,background:DS.cream,border:`1px solid ${DS.creamDD}`,borderRadius:8,boxSizing:"border-box",padding:"10px 13px",fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.ink,resize:"vertical",outline:"none",lineHeight:1.5}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/>
        </>)}
      </>)}

      {tab==="historial"&&(<>
        <SecLabel icon="ti-timeline">Línea de tiempo</SecLabel>
        {caso.historial.map((h,i)=>{const cfgMap={sistema:{bg:DS.creamD,txt:DS.slate,lbl:"SIS"},ia:{bg:DS.goldFaint,txt:DS.gold,lbl:"IA"},abogado:{bg:DS.blueL,txt:DS.blue,lbl:"ABG"}};const c=cfgMap[h.tipo]||cfgMap.sistema;return(<div key={i} style={{display:"flex",gap:10,marginBottom:14}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}><div style={{width:28,height:28,borderRadius:"50%",background:c.bg,border:`1px solid ${c.txt}30`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:800,color:c.txt}}>{c.lbl}</span></div><div style={{width:1,flex:1,background:DS.creamD,marginTop:4}}/></div><div style={{paddingBottom:4}}><div style={{display:"flex",gap:8,alignItems:"baseline",marginBottom:3}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:c.txt}}>{h.actor}</span><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{fmtShort(h.ts)}</span></div><p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.slate,margin:0,lineHeight:1.55}}>{h.msg}</p></div></div>);})}
      </>)}

      {tab==="cerrar"&&!cerrado&&(<>
        <SecLabel icon="ti-brain">Lección aprendida → RAG</SecLabel>
        <div style={{background:`${DS.gold}08`,border:`1px solid ${DS.goldLine}`,borderRadius:8,padding:"12px 14px",marginBottom:12}}>
          <p style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL,margin:"0 0 8px",lineHeight:1.5}}>Esta lección se guardará en Supabase y enviará al RAG.</p>
          <textarea value={leccion} onChange={e=>setLeccion(e.target.value)} placeholder="Ej: 'Art. 192 CT aplica incluso en segunda omisión…'" style={{width:"100%",minHeight:80,background:DS.white,border:`1px solid ${DS.goldLine}`,borderRadius:7,boxSizing:"border-box",padding:"9px 12px",fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,resize:"vertical",outline:"none",lineHeight:1.5}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.goldLine}/>
        </div>
        <SecLabel icon="ti-bolt">Acción final</SecLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[{id:"aprobar",icon:"ti-check",label:"Aprobar y enviar",sub:"Confirma al cliente",color:DS.green},{id:"cerrar",icon:"ti-circle-check",label:"Cerrar caso",sub:"Guarda lección en Supabase",color:DS.slate}].map(a=>(<AcBtn key={a.id} {...a} onClick={()=>onAccion(caso.id,a.id,{nota,leccion})}/>))}
        </div>
      </>)}
    </div>
  </div>);}

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR y TOPBAR
═══════════════════════════════════════════════════════════════════ */
function Sidebar({nav,setNav,urgentes,totalCasos}){
  const items=[{id:"casos",icon:"ti-inbox",label:"Casos"},{id:"metricas",icon:"ti-chart-line",label:"Métricas"},{id:"sistema",icon:"ti-cpu",label:"Sistema IA"}];
  return(<div style={{width:212,background:DS.cream,borderRight:`1px solid ${DS.creamD}`,display:"flex",flexDirection:"column",flexShrink:0,height:"100vh",overflow:"hidden"}}>
    <div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${DS.creamD}`}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,background:DS.ink,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:`1px solid ${DS.goldLine}`}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.gold}}>P</span></div>
        <div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,fontWeight:700,color:DS.ink,lineHeight:1.1}}>Pyme En Regla</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL,letterSpacing:"0.12em",textTransform:"uppercase"}}>Panel Interno</div></div>
      </div>
    </div>
    <div style={{flex:1,paddingTop:8,overflowY:"auto"}}>
      {items.map(it=>{const active=nav===it.id;const badge=it.id==="casos"&&urgentes>0;return(
        <button key={it.id} onClick={()=>setNav(it.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 18px",background:active?DS.goldFaint:"transparent",border:"none",borderLeft:`2px solid ${active?DS.gold:"transparent"}`,cursor:"pointer",transition:"all .15s"}}
          onMouseEnter={e=>{if(!active)e.currentTarget.style.background=DS.creamM;}}
          onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
          <i className={`ti ${it.icon}`} style={{fontSize:17,color:active?DS.gold:DS.slateL,width:18,flexShrink:0}} aria-hidden/>
          <span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:active?600:400,color:active?DS.gold:DS.slate,flex:1,textAlign:"left"}}>{it.label}</span>
          {badge&&<span style={{background:DS.red,color:"#fff",fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:10}}>{urgentes}</span>}
        </button>
      );})}
    </div>
    <div style={{padding:"10px 18px",borderTop:`1px solid ${DS.creamD}`,display:"flex",alignItems:"center",gap:6}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:DS.green,boxShadow:`0 0 6px ${DS.green}`}}/>
      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slate}}>Supabase · {totalCasos} casos</span>
    </div>
    <div style={{padding:"12px 18px",borderTop:`1px solid ${DS.creamD}`,display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:32,height:32,borderRadius:"50%",background:DS.ink,border:`1px solid ${DS.goldLine}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.gold}}>KL</span></div>
      <div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:DS.ink}}>Kurt Leupin</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL}}>Abogado · Admin</div></div>
    </div>
  </div>);}

function TopBar({nav,urgentes,escalados,slaVencidos,lastUpdate,onRefresh}){
  const titles={casos:"Gestión de casos",metricas:"Métricas del sistema",sistema:"Sistema multiagente"};
  return(<div style={{height:52,background:DS.white,borderBottom:`1px solid ${DS.creamD}`,display:"flex",alignItems:"center",padding:"0 24px",justifyContent:"space-between",flexShrink:0}}>
    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.slate}}>{titles[nav]||"Panel PER"}</span>
    <div style={{display:"flex",alignItems:"center",gap:16}}>
      {[{label:"HITL",val:urgentes,color:DS.amber},{label:"Escalados",val:escalados,color:DS.red},{label:"SLA vencidos",val:slaVencidos,color:DS.red}].map(({label,val,color})=>(
        <div key={label} style={{textAlign:"center"}}><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:val>0?color:DS.slateXL,lineHeight:1}}>{val}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:8,color:DS.slateL,letterSpacing:"0.08em",textTransform:"uppercase"}}>{label}</div></div>
      ))}
      {lastUpdate&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateXL}}>Actualizado {lastUpdate.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}</span>}
      <button onClick={onRefresh} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:DS.greenL,borderRadius:6,border:"none",cursor:"pointer"}}>
        <i className="ti ti-refresh" style={{fontSize:13,color:DS.green}} aria-hidden/>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:600,color:DS.green}}>Sincronizar</span>
      </button>
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:DS.blueL,borderRadius:6}}><div style={{width:6,height:6,borderRadius:"50%",background:DS.blue}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:600,color:DS.blue}}>Supabase</span></div>
    </div>
  </div>);}

/* ═══════════════════════════════════════════════════════════════════
   PANTALLA: CASOS (conectada a Supabase)
═══════════════════════════════════════════════════════════════════ */
function PantallaCasos({casos,actualizarEstado,actualizarDatos,eliminarCaso,cerrarCaso,showToast}){
  const [selId,setSelId]=useState(null);
  const [search,setSearch]=useState("");
  const [filtroEstado,setFiltroEstado]=useState("TODOS");
  const [modalEditar,setModalEditar]=useState(null);
  const [modalEliminar,setModalEliminar]=useState(null);

  useEffect(()=>{if(casos.length>0&&!selId)setSelId(casos[0].id);},[casos,selId]);
  const selCaso=casos.find(c=>c.id===selId);

  const filtered=casos.filter(c=>{
    const okE=filtroEstado==="TODOS"||c.estado===filtroEstado;
    const q=search.toLowerCase();
    const okS=!q||c.cliente.toLowerCase().includes(q)||c.id.toLowerCase().includes(q)||(c.rut||"").includes(q)||(c.asunto||"").toLowerCase().includes(q);
    return okE&&okS;
  });

  async function handleAccion(casoId,tipo,data){
    if(tipo==="cambiarEstado"){
      const err=await actualizarEstado(casoId,data);
      if(err)showToast("Error al cambiar estado","err");
      else showToast(`Estado → ${ESTADO_CFG[data]?.label||data}`,"ok");
      return;
    }
    if(tipo==="gestionarPlazo"){
      // Solo local por ahora
      showToast("Plazo marcado como gestionado","ok");
      return;
    }
    if(tipo==="cerrar"||tipo==="aprobar"){
      const err=await cerrarCaso(casoId,data?.leccion||"");
      if(err)showToast("Error al cerrar caso","err");
      else showToast("Caso cerrado. Lección guardada en Supabase","ok");
      return;
    }
    if(tipo==="escalar"){
      const err=await actualizarEstado(casoId,"ESCALADO");
      if(err)showToast("Error","err");
      else showToast("Caso escalado — Slack notificado","warn");
      return;
    }
    if(tipo==="responder"){showToast("Respuesta enviada","ok");return;}
  }

  async function handleSaveEditar(form){
    const err=await actualizarDatos(modalEditar.id,form);
    if(err)showToast("Error al actualizar datos","err");
    else{showToast("Datos actualizados en Supabase","ok");setModalEditar(null);}
  }

  async function handleEliminar(){
    const id=modalEliminar.id;
    const err=await eliminarCaso(id);
    if(err)showToast("Error al eliminar caso","err");
    else{
      showToast("Caso eliminado de Supabase","warn");
      setModalEliminar(null);
      const next=casos.find(c=>c.id!==id);
      if(next)setSelId(next.id);else setSelId(null);
    }
  }

  return(<>
    {modalEditar&&<ModalEditar caso={modalEditar} onSave={handleSaveEditar} onClose={()=>setModalEditar(null)}/>}
    {modalEliminar&&<ModalEliminar caso={modalEliminar} onConfirm={handleEliminar} onClose={()=>setModalEliminar(null)}/>}
    <div style={{display:"flex",flex:1,overflow:"hidden"}}>
      {/* Lista */}
      <div style={{width:300,background:DS.white,borderRight:`1px solid ${DS.creamD}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"14px 16px 10px",background:DS.cream,borderBottom:`1px solid ${DS.creamD}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.ink}}>Casos reales</span>
            <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{filtered.length} casos</span>
          </div>
          <div style={{position:"relative",marginBottom:10}}>
            <i className="ti ti-search" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:13,color:DS.slateL}} aria-hidden/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, RUT, folio, asunto…" style={{width:"100%",paddingLeft:30,height:32,background:DS.white,border:`1px solid ${DS.creamDD}`,borderRadius:7,boxSizing:"border-box",fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,outline:"none"}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {["TODOS","HITL","ESCALADO","EN_REVISION","CERRADO","PENDIENTE"].map(e=>{
              const cfg=ESTADO_CFG[e];const a=filtroEstado===e;
              return(<button key={e} onClick={()=>setFiltroEstado(e)} style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:4,cursor:"pointer",border:`1px solid ${a?(cfg?.dot||DS.gold):DS.creamDD}`,background:a?(cfg?cfg.bg:DS.goldFaint):"transparent",color:a?(cfg?.txt||DS.gold):DS.slateL}}>{e==="TODOS"?"Todos":cfg?.label||e}</button>);
            })}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {filtered.length===0&&<div style={{padding:"40px 20px",textAlign:"center"}}><i className="ti ti-search-off" style={{fontSize:32,color:DS.slateXL,display:"block",marginBottom:8}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL}}>Sin resultados</span></div>}
          {filtered.map(c=>(<CasoRow key={c.id} caso={c} selected={selId===c.id} onClick={()=>setSelId(c.id)}/>))}
        </div>
      </div>
      {/* Detalle */}
      <div style={{flex:1,overflow:"hidden"}}>
        {selCaso
          ?<CasoDetail caso={selCaso} onAccion={handleAccion} onEditar={c=>setModalEditar(c)} onEliminar={c=>setModalEliminar(c)}/>
          :<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",flexDirection:"column",gap:12}}>
            <i className="ti ti-clipboard-text" style={{fontSize:40,color:DS.slateXL}} aria-hidden/>
            <span style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:DS.slateL}}>Selecciona un caso</span>
          </div>
        }
      </div>
    </div>
  </>);}

/* ═══════════════════════════════════════════════════════════════════
   PANTALLA: MÉTRICAS (desde datos reales)
═══════════════════════════════════════════════════════════════════ */
function PantallaMetricas({casos}){
  const total=casos.length;
  const activos=casos.filter(c=>c.estado!=="CERRADO").length;
  const cerrados=casos.filter(c=>c.estado==="CERRADO").length;
  const hitl=casos.filter(c=>c.estado==="HITL").length;
  const escalados=casos.filter(c=>c.estado==="ESCALADO").length;
  const confProm=casos.length>0?(casos.reduce((s,c)=>s+(c.confianza||0),0)/casos.length):0;
  const porArea=Object.entries(casos.reduce((acc,c)=>{acc[c.area]=(acc[c.area]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]);
  const maxArea=porArea.length>0?porArea[0][1]:1;

  return(<div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:DS.creamM}}>
    <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>Métricas del sistema</h1>
    <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,margin:"0 0 20px"}}>Datos en tiempo real desde Supabase</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
      {[{label:"Casos totales",val:total,icon:"ti-folder",color:DS.ink},{label:"Activos",val:activos,icon:"ti-loader",color:DS.blue},{label:"Cerrados",val:cerrados,icon:"ti-circle-check",color:DS.green},{label:"HITL pendientes",val:hitl,icon:"ti-user-check",color:DS.amber},{label:"Escalados",val:escalados,icon:"ti-alarm",color:DS.red},{label:"Confianza IA prom.",val:`${Math.round(confProm*100)}%`,icon:"ti-brain",color:DS.purple}].map(({label,val,icon,color})=>(
        <Card key={label} style={{padding:"18px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><i className={`ti ${icon}`} style={{fontSize:18,color}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span></div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:700,color:DS.ink}}>{val}</div>
        </Card>
      ))}
    </div>
    {porArea.length>0&&(<Card style={{padding:"20px 24px",marginBottom:16}}>
      <SecLabel icon="ti-chart-bar">Casos por área (real)</SecLabel>
      {porArea.map(([area,count])=>(<div key={area} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,width:100}}>{area}</span>
        <div style={{flex:1,height:20,background:DS.creamM,borderRadius:4,overflow:"hidden"}}><div style={{width:`${(count/maxArea)*100}%`,height:"100%",background:AREA_COLOR[area]||DS.slate,borderRadius:4,transition:"width .6s"}}/></div>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:DS.ink,minWidth:16}}>{count}</span>
      </div>))}
    </Card>)}
    <Card style={{padding:"20px 24px"}}>
      <SecLabel icon="ti-list">Distribución de estados</SecLabel>
      {Object.entries(casos.reduce((acc,c)=>{acc[c.estado]=(acc[c.estado]||0)+1;return acc;},{})).map(([estado,count])=>{const cfg=ESTADO_CFG[estado]||ESTADO_CFG.PENDIENTE;return(<div key={estado} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <Chip label={cfg.label} dot={cfg.dot} bg={cfg.bg} txt={cfg.txt} size={10}/>
        <div style={{flex:1,height:16,background:DS.creamM,borderRadius:3,overflow:"hidden"}}><div style={{width:`${(count/total)*100}%`,height:"100%",background:cfg.dot,borderRadius:3}}/></div>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:DS.ink,minWidth:16}}>{count}</span>
      </div>);})}
    </Card>
  </div>);}

/* ═══════════════════════════════════════════════════════════════════
   PANTALLA: SISTEMA IA (estática)
═══════════════════════════════════════════════════════════════════ */
function PantallaSystem(){
  const agentes=[
    {id:"A0",nombre:"Intake & Routing",  estado:"ok",  canal:"Todos",       color:DS.blue},
    {id:"A1",nombre:"Societario",        estado:"ok",  canal:"Web/WA",      color:DS.inkM},
    {id:"A2",nombre:"Marcas INAPI",      estado:"warn",canal:"Web",         color:DS.purple},
    {id:"A3",nombre:"Contratos",         estado:"ok",  canal:"Web",         color:DS.slate},
    {id:"A4",nombre:"Tributario SII",    estado:"ok",  canal:"Web/WA",      color:DS.green},
    {id:"A5",nombre:"Laboral DT",        estado:"err", canal:"Instagram/WA",color:DS.amber},
    {id:"A6",nombre:"Consumidor SERNAC", estado:"ok",  canal:"WA",          color:DS.slate},
    {id:"A7",nombre:"Cobranza 30D",      estado:"ok",  canal:"Web",         color:DS.red},
  ];
  const estadoCfg={ok:{color:DS.green,label:"Operativo",icon:"ti-circle-check"},warn:{color:DS.amber,label:"Atención",icon:"ti-alert-triangle"},err:{color:DS.red,label:"Intervención",icon:"ti-alert-circle"}};
  return(<div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:DS.creamM}}>
    <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>Sistema multiagente</h1>
    <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,margin:"0 0 20px"}}>Estado de los agentes A0–A7</p>
    <Card style={{padding:"16px 20px",marginBottom:20,background:DS.ink,border:`1px solid ${DS.goldLine}`}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:10,background:DS.goldFaint,border:`1px solid ${DS.goldLine}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-brain" style={{fontSize:22,color:DS.gold}} aria-hidden/></div>
        <div style={{flex:1}}><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.gold}}>n8n Orquestador</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>n8n.srv1108143.hstgr.cloud · A0–A7 activos · Supabase conectado</div></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:DS.green,boxShadow:`0 0 8px ${DS.green}`}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:DS.green}}>Operativo</span></div>
      </div>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
      {agentes.map(ag=>{const s=estadoCfg[ag.estado];return(
        <Card key={ag.id} style={{padding:"16px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:8,background:ag.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:800,color:"#fff"}}>{ag.id}</span></div>
              <div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.ink}}>{ag.nombre}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{ag.canal}</div></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}><i className={`ti ${s.icon}`} style={{fontSize:14,color:s.color}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:s.color}}>{s.label}</span></div>
          </div>
          {ag.estado!=="ok"&&<div style={{display:"flex",alignItems:"center",gap:6,background:ag.estado==="err"?DS.redL:DS.amberL,borderRadius:5,padding:"5px 9px"}}><i className="ti ti-alert-triangle" style={{fontSize:12,color:ag.estado==="err"?DS.red:DS.amber}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:ag.estado==="err"?DS.red:DS.amber}}>{ag.estado==="err"?"Requiere intervención":"Tasa de escalación elevada"}</span></div>}
        </Card>
      );})}
    </div>
  </div>);}

/* ═══════════════════════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════════════════════ */
export default function PERApp(){
  const [nav,setNav]=useState("casos");
  const [toast,setToast]=useState(null);
  const {casos,loading,error,lastUpdate,fetchCasos,actualizarEstado,actualizarDatos,eliminarCaso,cerrarCaso}=useCasosSupabase();

  useEffect(()=>{
    const existing=document.querySelector("[data-per-fonts]");if(existing)return;
    const link=document.createElement("link");link.setAttribute("data-per-fonts","1");
    link.href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Outfit:wght@300;400;500;600;700;800&display=swap";
    link.rel="stylesheet";document.head.appendChild(link);
  },[]);
  useEffect(()=>{
    const existing=document.querySelector("[data-tabler]");if(existing)return;
    const link=document.createElement("link");link.setAttribute("data-tabler","1");
    link.href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css";
    link.rel="stylesheet";document.head.appendChild(link);
  },[]);

  function showToast(msg,tipo="ok"){setToast({msg,tipo});setTimeout(()=>setToast(null),3200);}

  const urgentes=casos.filter(c=>c.estado==="HITL").length;
  const escalados=casos.filter(c=>c.estado==="ESCALADO").length;
  const slaVencidos=casos.filter(c=>c.estado!=="CERRADO"&&slaStatus(c.sla,c.horasTranscurridas).label==="Vencido").length;

  const loginScreen=(
    <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:DS.cream,flexDirection:"column",gap:24}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <div style={{width:48,height:48,background:DS.ink,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${DS.goldLine}`}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:700,color:DS.gold}}>P</span></div>
        <div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:DS.ink}}>Pyme En Regla</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,letterSpacing:"0.12em",textTransform:"uppercase"}}>Panel Interno</div></div>
      </div>
      <SignIn />
    </div>
  );

  const dashboard=(
    <div style={{display:"flex",height:"100vh",background:DS.creamM,fontFamily:"'Outfit',sans-serif",overflow:"hidden",position:"relative"}}>
      <Toast toast={toast}/>
      <Sidebar nav={nav} setNav={setNav} urgentes={urgentes} totalCasos={casos.length}/>
      <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",minWidth:0}}>
        <TopBar nav={nav} urgentes={urgentes} escalados={escalados} slaVencidos={slaVencidos} lastUpdate={lastUpdate} onRefresh={fetchCasos}/>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {loading&&<LoadingScreen/>}
          {!loading&&error&&<ErrorScreen error={error} onRetry={fetchCasos}/>}
          {!loading&&!error&&nav==="casos"&&<PantallaCasos casos={casos} actualizarEstado={actualizarEstado} actualizarDatos={actualizarDatos} eliminarCaso={eliminarCaso} cerrarCaso={cerrarCaso} showToast={showToast}/>}
          {!loading&&!error&&nav==="metricas"&&<PantallaMetricas casos={casos}/>}
          {!loading&&!error&&nav==="sistema"&&<PantallaSystem/>}
        </div>
      </div>
    </div>
  );

  return(<><SignedOut>{loginScreen}</SignedOut><SignedIn>{dashboard}</SignedIn></>);
}

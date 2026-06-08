import { useState, useEffect, useCallback } from "react";
import { SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { supabase } from "./lib/supabase";

// ─── WEBHOOKS DE ACCIÓN ────────────────────────────────────────────────────────
const WH = {
  procesar:  "https://n8n.srv1108143.hstgr.cloud/webhook/per-procesar-caso",
  aprobar:   "https://n8n.srv1108143.hstgr.cloud/webhook/per-aprobar",
  escalar:   "https://n8n.srv1108143.hstgr.cloud/webhook/per-escalar",
  cerrar:    "https://n8n.srv1108143.hstgr.cloud/webhook/per-cerrar",
};

async function dispararWebhook(url, payload) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
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

const ETAPAS_SOP=["Intake","Diagnóstico","CLM/Firma","Ejecución","Control","Cierre","Post-venta","Retro-loop"];
const ESTADO_CFG={
  HITL:{label:"HITL Pendiente",dot:DS.amber,bg:DS.amberL,txt:DS.amberT},
  EN_REVISION:{label:"En Revisión",dot:DS.blue,bg:DS.blueL,txt:DS.blueT},
  ESCALADO:{label:"Escalado",dot:DS.red,bg:DS.redL,txt:DS.redT},
  CERRADO:{label:"Cerrado",dot:DS.green,bg:DS.greenL,txt:DS.greenT},
  PENDIENTE:{label:"Pendiente",dot:DS.slate,bg:DS.inkFade,txt:DS.slate},
  PROCESANDO:{label:"Procesando…",dot:DS.purple,bg:DS.purpleL,txt:DS.purpleT},
};
const AREA_ICON={Marcas:"M",Societario:"S",Laboral:"L",Tributario:"T",Contratos:"C",Consumidor:"CO",Cobranza:"CB",Orientacion:"O",Otro:"?"};
const AREA_COLOR={Marcas:DS.purple,Societario:DS.blue,Laboral:DS.amber,Tributario:DS.green,Contratos:DS.slate,Consumidor:DS.inkM,Cobranza:DS.red,Orientacion:DS.slate,Otro:DS.slate};
const CANAL_ICON={"Web":"ti-world","WhatsApp":"ti-brand-whatsapp","Instagram DM":"ti-brand-instagram","web":"ti-world","whatsapp":"ti-brand-whatsapp","instagram":"ti-brand-instagram"};
const URGENCIA_CFG={critica:{color:DS.red,bg:DS.redL},alta:{color:DS.amber,bg:DS.amberL},media:{color:DS.blue,bg:DS.blueL},baja:{color:DS.slate,bg:DS.inkFade}};

const PLAZOS_INIT=[
  {id:"PL-001",tipo:"Marca INAPI",cliente:"Constructora Austral Ltda.",asunto:"AUSTRAL BUILDS — pago final registro",fecha:"2026-06-10",diasRestantes:6,urgencia:"critica",ref:"PER-2026-0001",gestionado:false},
  {id:"PL-002",tipo:"Laboral DT",cliente:"Clínica VetSur SpA",asunto:"Fuero maternal — acción urgente",fecha:"2026-06-08",diasRestantes:4,urgencia:"alta",ref:"PER-2026-0002",gestionado:false},
  {id:"PL-003",tipo:"SII F29",cliente:"Panadería Don Lucho E.I.R.L.",asunto:"Formulario 29 — junio 2026",fecha:"2026-06-12",diasRestantes:8,urgencia:"media",ref:"PER-2026-0003",gestionado:false},
];

const RAG_FUENTES=[
  {id:"F01",nombre:"Ley 19.039 — Propiedad Industrial",area:"Marcas",chunks:412,estado:"ok",fecha:"2024-05-15",size:"1.2 MB"},
  {id:"F02",nombre:"Guía INAPI Clases Niza 2023",area:"Marcas",chunks:287,estado:"ok",fecha:"2024-05-15",size:"890 KB"},
  {id:"F03",nombre:"Código del Trabajo (actualizado)",area:"Laboral",chunks:1240,estado:"ok",fecha:"2024-05-20",size:"3.1 MB"},
  {id:"F04",nombre:"Ley 21.327 — Modernización Laboral",area:"Laboral",chunks:183,estado:"ok",fecha:"2024-05-10",size:"540 KB"},
  {id:"F05",nombre:"Código Tributario SII",area:"Tributario",chunks:892,estado:"ok",fecha:"2024-05-18",size:"2.4 MB"},
  {id:"F06",nombre:"Circular SII N°8 2022",area:"Tributario",chunks:95,estado:"ok",fecha:"2024-04-30",size:"310 KB"},
  {id:"F07",nombre:"Ley 20.659 — Empresas en un día",area:"Societario",chunks:134,estado:"ok",fecha:"2024-05-12",size:"420 KB"},
  {id:"F08",nombre:"Manual SpA emprendesimple.cl",area:"Societario",chunks:88,estado:"warn",fecha:"2024-03-01",size:"280 KB"},
  {id:"F09",nombre:"Ley 19.628 — Protección Datos",area:"Contratos",chunks:201,estado:"ok",fecha:"2024-05-22",size:"610 KB"},
  {id:"F10",nombre:"Ley 19.496 — Consumidor",area:"Consumidor",chunks:318,estado:"ok",fecha:"2024-05-08",size:"950 KB"},
  {id:"F11",nombre:"Template mandato INAPI v3",area:"Marcas",chunks:12,estado:"ok",fecha:"2024-06-01",size:"45 KB"},
  {id:"F12",nombre:"Template contrato trabajo v6",area:"Laboral",chunks:18,estado:"ok",fecha:"2024-06-01",size:"62 KB"},
  {id:"F13",nombre:"Template carta condonación SII v1",area:"Tributario",chunks:8,estado:"ok",fecha:"2024-05-15",size:"28 KB"},
  {id:"F14",nombre:"Template escritura SpA v2",area:"Societario",chunks:22,estado:"ok",fecha:"2024-05-20",size:"78 KB"},
  {id:"F15",nombre:"Template contrato servicios v5",area:"Contratos",chunks:31,estado:"ok",fecha:"2024-06-01",size:"95 KB"},
  {id:"F16",nombre:"Jurisprudencia DT 2023 fuero maternal",area:"Laboral",chunks:156,estado:"ok",fecha:"2024-04-15",size:"480 KB"},
  {id:"F17",nombre:"Template NDA internacional v2",area:"Contratos",chunks:14,estado:"warn",fecha:"2024-02-10",size:"38 KB"},
];

const KPIS_STATIC={ragChunks:5768,ragFuentes:17,ragTemplates:34};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtDate(ts){if(!ts)return"-";const d=new Date(ts);return d.toLocaleDateString("es-CL",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});}
function fmtShort(ts){if(!ts)return"-";const d=new Date(ts);return d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})+" · "+d.toLocaleDateString("es-CL",{day:"2-digit",month:"short"});}
function horasDesde(ts){if(!ts)return 0;const diff=Date.now()-new Date(ts).getTime();return Math.floor(diff/3600000);}
function horasLabel(h){return h<24?`${h}h`:`${Math.floor(h/24)}d ${h%24}h`;}
function slaStatus(sla,horas){const p=horas/(sla||48);if(p>=1)return{label:"Vencido",color:DS.red,pct:100};if(p>=0.75)return{label:"Urgente",color:DS.amber,pct:Math.round(p*100)};return{label:"En plazo",color:DS.green,pct:Math.round(p*100)};}

function mapCaso(row){
  const horas=horasDesde(row.ingresado_at||row.created_at);
  // Parsear JSONB si viene como string
  const parseJsonb=(v)=>{if(!v)return[];if(typeof v==="string"){try{return JSON.parse(v);}catch{return[];}}return Array.isArray(v)?v:[];};
  return{
    id:row.folio||row.id,
    uuid:row.id, // UUID real de Supabase para webhooks
    folio:(row.folio||"").split("-").pop()||"0000",
    cliente:row.contacto_nombre||row.cliente_rut||"Sin nombre",rut:row.cliente_rut||"-",
    contacto:{nombre:row.contacto_nombre||"-",email:row.contacto_email||"-",tel:row.contacto_tel||"-"},
    area:row.area||"Otro",agente:row.agente_id||"A0",estado:row.estado||"PENDIENTE",
    kit:row.kit||"Arranque",prioridad:row.prioridad||"MEDIA",
    confianza:parseFloat(row.confianza_ia)||0,
    canal:row.canal||"Web",sla:parseInt(row.sla_horas)||48,horasTranscurridas:horas,
    etapa:row.estado==="CERRADO"?6:row.estado==="EN_REVISION"?3:2,
    asunto:row.asunto||"Sin asunto",ingreso:row.ingresado_at||row.created_at,
    plazoCritico:row.plazo_critico||null,plazoCriticoGestionado:false,
    // Campos v7 — trabajo del agente
    resumenIA:row.resumen_ia||"",
    acciones:parseJsonb(row.acciones_pendientes),
    fuentesRAG:parseJsonb(row.fuentes_rag),
    notaAbogado:row.nota_abogado||"",
    borradorAprobado:row.borrador_aprobado||false,
    documentos:parseJsonb(row.documentos),
    leccion:row.leccion_aprendida||"",
    modeloUsado:row.modelo_usado||"",
    historial:[
      {ts:row.ingresado_at||row.created_at,actor:"Sistema",tipo:"sistema",msg:`Caso ingresado vía ${row.canal||"web"}. Folio ${row.folio||row.id}.`},
      ...(row.resumen_ia?[{ts:row.ultima_accion_at||row.ingresado_at,actor:`Agente ${row.agente_id||"IA"}`,tipo:"ia",msg:`Análisis completado. Confianza ${Math.round((parseFloat(row.confianza_ia)||0)*100)}%.`}]:[]),
    ],
    _raw:row,
  };
}

// ─── HOOK SUPABASE ────────────────────────────────────────────────────────────
function useCasosSupabase(){
  const[casos,setCasos]=useState([]);const[loading,setLoading]=useState(true);const[error,setError]=useState(null);const[lastUpdate,setLastUpdate]=useState(null);
  const fetchCasos=useCallback(async()=>{
    try{const{data,error:err}=await supabase.from("casos").select("*").order("ingresado_at",{ascending:false}).limit(200);if(err)throw err;setCasos((data||[]).map(mapCaso));setLastUpdate(new Date());setError(null);}
    catch(e){console.error(e);setError(e.message);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{fetchCasos();const ch=supabase.channel("casos_rt").on("postgres_changes",{event:"*",schema:"public",table:"casos"},()=>fetchCasos()).subscribe();return()=>supabase.removeChannel(ch);},[fetchCasos]);
  const actualizarEstado=useCallback(async(casoUuid,est)=>{const{error:e}=await supabase.from("casos").update({estado:est,ultima_accion_at:new Date().toISOString()}).eq("id",casoUuid);if(!e)setCasos(p=>p.map(c=>c.uuid===casoUuid?{...c,estado:est}:c));return e;},[]);
  const actualizarNota=useCallback(async(casoUuid,nota)=>{const{error:e}=await supabase.from("casos").update({nota_abogado:nota,ultima_accion_at:new Date().toISOString()}).eq("id",casoUuid);return e;},[]);
  const actualizarDatos=useCallback(async(casoUuid,form)=>{const{error:e}=await supabase.from("casos").update({contacto_nombre:form.nombre,contacto_email:form.email,contacto_tel:form.tel,cliente_rut:form.rut,asunto:form.asunto,ultima_accion_at:new Date().toISOString()}).eq("id",casoUuid);if(!e)setCasos(p=>p.map(c=>c.uuid===casoUuid?{...c,cliente:form.nombre,rut:form.rut,asunto:form.asunto,contacto:{nombre:form.nombre,email:form.email,tel:form.tel}}:c));return e;},[]);
  const eliminarCaso=useCallback(async(casoUuid)=>{const{error:e}=await supabase.from("casos").delete().eq("id",casoUuid);if(!e)setCasos(p=>p.filter(c=>c.uuid!==casoUuid));return e;},[]);
  const cerrarCaso=useCallback(async(casoUuid,leccion)=>{const{error:e}=await supabase.from("casos").update({estado:"CERRADO",leccion_aprendida:leccion,cerrado_at:new Date().toISOString(),retro_enviado:false,ultima_accion_at:new Date().toISOString()}).eq("id",casoUuid);if(!e)setCasos(p=>p.map(c=>c.uuid===casoUuid?{...c,estado:"CERRADO",leccion}:c));return e;},[]);
  return{casos,loading,error,lastUpdate,fetchCasos,actualizarEstado,actualizarNota,actualizarDatos,eliminarCaso,cerrarCaso};
}

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
function Toast({toast}){if(!toast)return null;const cfg={ok:{bg:DS.green,icon:"ti-check"},warn:{bg:DS.amber,icon:"ti-alert-triangle"},err:{bg:DS.red,icon:"ti-x"},info:{bg:DS.blue,icon:"ti-loader-2"}};const c=cfg[toast.tipo]||cfg.ok;return(<div style={{position:"fixed",top:16,right:16,zIndex:9999,background:c.bg,color:"#fff",padding:"11px 18px",borderRadius:8,fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 24px rgba(0,0,0,.2)"}}><i className={`ti ${c.icon}`} style={{fontSize:16}} aria-hidden/>{toast.msg}</div>);}
function Chip({label,dot,bg,txt,size=11}){return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:bg,color:txt,fontSize:size,fontFamily:"'Outfit',sans-serif",fontWeight:600,padding:"3px 9px",borderRadius:5,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{dot&&<span style={{width:5,height:5,borderRadius:"50%",background:dot,flexShrink:0}}/>}{label}</span>);}
function Bar({pct,color,height=3}){return(<div style={{flex:1,height,background:DS.creamDD,borderRadius:2,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color,borderRadius:2,transition:"width .5s"}}/></div>);}
function SecLabel({children,icon}){return(<div style={{display:"flex",alignItems:"center",gap:7,margin:"0 0 10px"}}>{icon&&<i className={`ti ${icon}`} style={{fontSize:13,color:DS.slateL}} aria-hidden/>}<span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.12em"}}>{children}</span></div>);}
function Card({children,style={},onClick}){return(<div onClick={onClick} style={{background:DS.white,border:`1px solid ${DS.creamD}`,borderRadius:10,...style}}>{children}</div>);}
function ConfBar({val,compact=false}){const pct=Math.round((val||0)*100);const color=pct>=70?DS.green:pct>=40?DS.amber:pct>0?DS.red:DS.slateXL;const label=pct===0?"Sin análisis":`${pct}%`;return(<div style={{display:"flex",alignItems:"center",gap:8}}>{!compact&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,width:58}}>Confianza</span>}<Bar pct={pct} color={color}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color,minWidth:28}}>{label}</span></div>);}
function SlaBar({sla,horas,compact=false}){const{label,color,pct}=slaStatus(sla,horas);return(<div style={{display:"flex",alignItems:"center",gap:8}}>{!compact&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,width:58}}>SLA {sla}h</span>}<Bar pct={pct} color={color}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color,minWidth:52}}>{label}</span></div>);}
function SopBar({etapa}){return(<div style={{margin:"0 0 14px"}}><SecLabel icon="ti-route">Etapa del caso</SecLabel><div style={{display:"flex",gap:0,position:"relative"}}>{ETAPAS_SOP.map((e,i)=>{const done=i<etapa,active=i===etapa;return(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative"}}><div style={{width:"100%",height:3,background:done?DS.gold:active?DS.goldL:DS.creamDD}}/><div style={{width:7,height:7,borderRadius:"50%",background:done?DS.gold:active?DS.goldL:DS.creamDD,border:`1px solid ${done?DS.gold:active?DS.gold:DS.creamDD}`,position:"absolute",top:-2}}/>{active&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:8,fontWeight:700,color:DS.gold,marginTop:6,whiteSpace:"nowrap"}}>{e}</span>}</div>);})}</div><div style={{display:"flex",justifyContent:"space-between",marginTop:14}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL}}>Intake</span><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL}}>Retro-loop</span></div></div>);}
function AcBtn({icon,label,sub,color,onClick,disabled=false}){const[h,setH]=useState(false);return(<button disabled={disabled} onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,padding:"11px 13px",background:disabled?"#f0f0f0":h?color:"transparent",border:`1px solid ${disabled?"#ddd":h?color:DS.creamDD}`,borderRadius:9,cursor:disabled?"not-allowed":"pointer",transition:"all .15s",textAlign:"left",opacity:disabled?0.5:1}}><div style={{display:"flex",alignItems:"center",gap:7}}><i className={`ti ${icon}`} style={{fontSize:15,color:disabled?"#aaa":h?"#fff":color}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:disabled?"#aaa":h?"#fff":color}}>{label}</span></div><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:h?"rgba(255,255,255,.7)":DS.slateL}}>{sub}</span></button>);}

// ─── MODALES ──────────────────────────────────────────────────────────────────
function ModalEditar({caso,onSave,onClose}){
  const[form,setForm]=useState({nombre:caso.contacto.nombre,rut:caso.rut,email:caso.contacto.email,tel:caso.contacto.tel,asunto:caso.asunto});
  const[saving,setSaving]=useState(false);
  const inp={width:"100%",padding:"8px 10px",borderRadius:6,boxSizing:"border-box",border:`1px solid ${DS.creamDD}`,background:DS.white,fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,outline:"none"};
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:8888,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:DS.white,borderRadius:12,width:480,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{padding:"20px 24px",borderBottom:`1px solid ${DS.creamD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.ink}}>Editar datos del caso</span><button onClick={onClose} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:20,color:DS.slateL}}>×</button></div>
      <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
        {[["nombre","Nombre contacto"],["rut","RUT"],["email","Email"],["tel","Teléfono"],["asunto","Asunto"]].map(([k,lbl])=>(<div key={k}><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>{lbl}</label><input value={form[k]||""} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/></div>))}
      </div>
      <div style={{padding:"16px 24px",borderTop:`1px solid ${DS.creamD}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"9px 18px",borderRadius:7,border:`1px solid ${DS.creamDD}`,background:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slate}}>Cancelar</button>
        <button onClick={async()=>{setSaving(true);await onSave(form);setSaving(false);}} disabled={saving} style={{padding:"9px 18px",borderRadius:7,border:"none",background:DS.ink,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.gold}}>{saving?"Guardando…":"Guardar en Supabase"}</button>
      </div>
    </div>
  </div>);}

function ModalNuevoCaso({onSave,onClose}){
  const[form,setForm]=useState({nombre:"",rut_persona:"",email:"",tel:"",empresa:"",rut_empresa:"",canal:"presencial",area:"Laboral",kit:"Arranque",prioridad:"MEDIA",asunto:"",consulta_raw:""});
  const[saving,setSaving]=useState(false);
  const inp={width:"100%",padding:"8px 10px",borderRadius:6,boxSizing:"border-box",border:`1px solid ${DS.creamDD}`,background:DS.white,fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,outline:"none"};
  const sel={...inp,cursor:"pointer"};
  const fields=[
    ["nombre","Nombre contacto","text"],["rut_persona","RUT persona natural","text"],
    ["email","Email","email"],["tel","Teléfono","text"],
    ["empresa","Empresa","text"],["rut_empresa","RUT empresa","text"],
    ["asunto","Asunto (título breve)","text"],
  ];
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:8888,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:DS.white,borderRadius:12,width:560,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{padding:"20px 24px",borderBottom:`1px solid ${DS.creamD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.ink}}>Nuevo caso manual</span>
        <button onClick={onClose} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:20,color:DS.slateL}}>×</button>
      </div>
      <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {fields.map(([k,lbl,type])=>(<div key={k}><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>{lbl}</label><input type={type} value={form[k]||""} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/></div>))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <div><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>Canal</label>
            <select value={form.canal} onChange={e=>setForm(p=>({...p,canal:e.target.value}))} style={sel} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}>
              {["presencial","telefono","whatsapp","referido","otro"].map(c=>(<option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>))}
            </select>
          </div>
          <div><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>Área legal</label>
            <select value={form.area} onChange={e=>setForm(p=>({...p,area:e.target.value}))} style={sel} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}>
              {["Laboral","Contratos","Marcas","Tributario","Societario","Consumidor","Cobranza","Orientacion"].map(a=>(<option key={a} value={a}>{a}</option>))}
            </select>
          </div>
          <div><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>Kit</label>
            <select value={form.kit} onChange={e=>setForm(p=>({...p,kit:e.target.value}))} style={sel} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}>
              {["Arranque","Compliance","Premium"].map(k=>(<option key={k} value={k}>{k}</option>))}
            </select>
          </div>
        </div>
        <div><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>Prioridad</label>
          <div style={{display:"flex",gap:8}}>
            {[["BAJA","Baja",DS.slate],["MEDIA","Normal",DS.blue],["ALTA","Alta",DS.amber],["CRITICA","Crítica",DS.red]].map(([val,lbl,color])=>(<button key={val} onClick={()=>setForm(p=>({...p,prioridad:val}))} style={{flex:1,padding:"7px",borderRadius:6,border:`1px solid ${form.prioridad===val?color:DS.creamDD}`,background:form.prioridad===val?`${color}20`:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:form.prioridad===val?700:400,color:form.prioridad===val?color:DS.slateL}}>{lbl}</button>))}
          </div>
        </div>
        <div><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:4}}>Descripción / consulta</label>
          <textarea value={form.consulta_raw} onChange={e=>setForm(p=>({...p,consulta_raw:e.target.value}))} placeholder="Describe la situación del cliente con el mayor detalle posible…" style={{width:"100%",minHeight:100,background:DS.cream,border:`1px solid ${DS.creamDD}`,borderRadius:8,boxSizing:"border-box",padding:"10px 13px",fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,resize:"vertical",outline:"none",lineHeight:1.5}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/>
        </div>
      </div>
      <div style={{padding:"16px 24px",borderTop:`1px solid ${DS.creamD}`,display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
        {!form.nombre&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL,flex:1}}>* Nombre requerido</span>}
        <button onClick={onClose} style={{padding:"9px 18px",borderRadius:7,border:`1px solid ${DS.creamDD}`,background:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slate}}>Cancelar</button>
        <button onClick={async()=>{if(!form.nombre)return;setSaving(true);await onSave(form);setSaving(false);}} disabled={!form.nombre||saving} style={{padding:"9px 18px",borderRadius:7,border:"none",background:form.nombre?DS.ink:"#ccc",cursor:form.nombre?"pointer":"not-allowed",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.gold}}>{saving?"Creando…":"Crear caso"}</button>
      </div>
    </div>
  </div>);}
function ModalEliminar({caso,onConfirm,onClose}){
  const[confirm,setConfirm]=useState("");const[saving,setSaving]=useState(false);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:8888,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:DS.white,borderRadius:12,width:420,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{padding:"20px 24px",borderBottom:`1px solid ${DS.creamD}`}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.red}}>Eliminar caso</span></div>
      <div style={{padding:"20px 24px"}}><p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slate,margin:"0 0 16px",lineHeight:1.6}}>Esta acción elimina el caso <strong>{caso.id}</strong> de Supabase permanentemente.</p><p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.slateL,margin:"0 0 8px"}}>Escribe el folio para confirmar:</p><input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder={caso.id} style={{width:"100%",padding:"8px 10px",borderRadius:6,boxSizing:"border-box",border:`1px solid ${DS.creamDD}`,fontFamily:"'Outfit',sans-serif",fontSize:12,outline:"none"}}/></div>
      <div style={{padding:"16px 24px",borderTop:`1px solid ${DS.creamD}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"9px 18px",borderRadius:7,border:`1px solid ${DS.creamDD}`,background:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slate}}>Cancelar</button>
        <button onClick={async()=>{if(confirm!==caso.id)return;setSaving(true);await onConfirm();setSaving(false);}} disabled={confirm!==caso.id||saving} style={{padding:"9px 18px",borderRadius:7,border:"none",background:confirm===caso.id?DS.red:"#ccc",cursor:confirm===caso.id?"pointer":"not-allowed",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:"#fff"}}>{saving?"Eliminando…":"Eliminar"}</button>
      </div>
    </div>
  </div>);}

// ─── CASO ROW ─────────────────────────────────────────────────────────────────
function CasoRow({caso,selected,onClick}){
  const est=ESTADO_CFG[caso.estado]||ESTADO_CFG.PENDIENTE;
  const urgent=caso.estado==="ESCALADO"||caso.estado==="HITL";
  const tieneAnalisis=caso.resumenIA&&caso.resumenIA.length>0;
  const ac=AREA_COLOR[caso.area]||DS.slate;
  return(<div onClick={onClick} style={{padding:"13px 16px",borderBottom:`1px solid ${DS.creamD}`,cursor:"pointer",background:selected?DS.goldFaint:urgent?"rgba(148,96,16,0.04)":DS.white,borderLeft:`3px solid ${selected?DS.gold:urgent?DS.amber:"transparent"}`,transition:"background .12s"}} onMouseEnter={e=>{if(!selected)e.currentTarget.style.background=DS.creamM;}} onMouseLeave={e=>{if(!selected)e.currentTarget.style.background=urgent?"rgba(148,96,16,0.04)":DS.white;}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:22,height:22,borderRadius:5,background:ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:800,color:"#fff"}}>{AREA_ICON[caso.area]||"?"}</span></div>
        <span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.gold}}>{caso.id}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        {tieneAnalisis&&<span style={{width:6,height:6,borderRadius:"50%",background:DS.green,display:"inline-block"}} title="Agente procesó este caso"/>}
        <Chip label={est.label} dot={est.dot} bg={est.bg} txt={est.txt} size={9}/>
      </div>
    </div>
    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.ink,marginBottom:3,lineHeight:1.2}}>{caso.cliente}</div>
    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slate,marginBottom:8,lineHeight:1.4}}>{(caso.asunto||"").length>60?(caso.asunto||"").slice(0,60)+"…":caso.asunto||"-"}</div>
    <div style={{display:"flex",flexDirection:"column",gap:4}}><ConfBar val={caso.confianza} compact/><SlaBar sla={caso.sla} horas={caso.horasTranscurridas} compact/></div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
      <div style={{display:"flex",alignItems:"center",gap:5}}><i className={`ti ${CANAL_ICON[caso.canal]||"ti-device-mobile"}`} style={{fontSize:12,color:DS.slateL}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{caso.canal}</span></div>
      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateXL}}>{horasLabel(caso.horasTranscurridas)}</span>
    </div>
    {caso.plazoCritico&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:5,background:DS.redL,padding:"4px 8px",borderRadius:4}}><i className="ti ti-alert-triangle" style={{fontSize:11,color:DS.red}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.red,fontWeight:700}}>Plazo: {new Date(caso.plazoCritico).toLocaleDateString("es-CL")}</span></div>}
  </div>);}

// ─── CASO DETAIL v7 ───────────────────────────────────────────────────────────
function CasoDetail({caso,onAccion,onEditar,onEliminar,showToast}){
  const[tab,setTab]=useState("mesa");
  const[nota,setNota]=useState(caso.notaAbogado||"");
  const[leccion,setLeccion]=useState(caso.leccion||"");
  const[procesando,setProcesando]=useState(false);
  const[guardandoNota,setGuardandoNota]=useState(false);
  const est=ESTADO_CFG[caso.estado]||ESTADO_CFG.PENDIENTE;
  const cerrado=caso.estado==="CERRADO";
  const tieneAnalisis=caso.resumenIA&&caso.resumenIA.length>10;
  const ac=AREA_COLOR[caso.area]||DS.slate;

  const TABS=[
    {id:"mesa",label:"Mesa de trabajo",icon:"ti-briefcase"},
    {id:"resumen",label:"Resumen",icon:"ti-clipboard-text"},
    {id:"historial",label:"Historial",icon:"ti-timeline"},
    {id:"cerrar",label:"Cierre",icon:"ti-circle-check",hidden:cerrado},
  ].filter(t=>!t.hidden);

  async function handleProcesar(){
    setProcesando(true);
    await onAccion(caso.uuid,"procesar",null);
    setProcesando(false);
  }

  async function handleGuardarNota(){
    setGuardandoNota(true);
    await onAccion(caso.uuid,"guardarNota",nota);
    setGuardandoNota(false);
  }

  return(<div style={{display:"flex",flexDirection:"column",height:"100%",background:DS.white}}>
    {/* Header */}
    <div style={{padding:"18px 24px 0",borderBottom:`1px solid ${DS.creamD}`,background:DS.cream,flexShrink:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
            <div style={{background:DS.ink,borderRadius:6,padding:"4px 12px",display:"inline-flex",alignItems:"center",border:`1px solid ${DS.goldLine}`}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:800,color:DS.gold,letterSpacing:"0.06em"}}>{caso.id}</span></div>
            <Chip label={est.label} dot={est.dot} bg={est.bg} txt={est.txt}/>
            {caso.modeloUsado&&<Chip label={caso.modeloUsado} bg={DS.purpleL} txt={DS.purple} size={9}/>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:26,height:26,borderRadius:5,background:ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:800,color:"#fff"}}>{AREA_ICON[caso.area]||"?"}</span></div><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:700,color:DS.ink}}>{caso.cliente}</span></div>
          <div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,marginTop:2}}>RUT {caso.rut} · Kit {caso.kit} · Agente {caso.agente}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"flex-start",flexShrink:0,marginLeft:12}}>
          {!cerrado&&(<select value={caso.estado} onChange={e=>onAccion(caso.uuid,"cambiarEstado",e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${DS.creamDD}`,background:DS.white,fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.ink,cursor:"pointer",outline:"none"}}><option value="HITL">HITL Pendiente</option><option value="EN_REVISION">En Revisión</option><option value="ESCALADO">Escalado</option><option value="CERRADO">Cerrado</option></select>)}
          <button onClick={()=>onEditar(caso)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:6,border:`1px solid ${DS.creamDD}`,background:DS.white,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slate}} onMouseEnter={e=>{e.currentTarget.style.borderColor=DS.gold;e.currentTarget.style.color=DS.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=DS.creamDD;e.currentTarget.style.color=DS.slate;}}><i className="ti ti-pencil" style={{fontSize:12}} aria-hidden/>Editar</button>
          <button onClick={()=>onEliminar(caso)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:6,border:`1px solid ${DS.redL}`,background:DS.redL,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.red}} onMouseEnter={e=>{e.currentTarget.style.background=DS.red;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background=DS.redL;e.currentTarget.style.color=DS.red;}}><i className="ti ti-trash" style={{fontSize:12}} aria-hidden/>Eliminar</button>
        </div>
      </div>
      <p style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontSize:14,color:DS.inkM,margin:"0 0 10px",lineHeight:1.4}}>"{caso.asunto||"Sin asunto"}"</p>
      <SopBar etapa={caso.etapa}/>
      <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}><ConfBar val={caso.confianza}/><SlaBar sla={caso.sla} horas={caso.horasTranscurridas}/></div>
      {caso.plazoCritico&&(<div style={{display:"flex",alignItems:"center",gap:8,background:DS.redL,borderRadius:7,padding:"8px 12px",marginBottom:10}}><i className="ti ti-alarm" style={{fontSize:15,color:DS.red}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:DS.red}}>Plazo crítico: {new Date(caso.plazoCritico).toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"})}</span></div>)}
      <div style={{display:"flex",gap:0,marginBottom:-1,overflowX:"auto"}}>{TABS.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"8px 12px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===t.id?DS.gold:"transparent"}`,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}><i className={`ti ${t.icon}`} style={{fontSize:12,color:tab===t.id?DS.gold:DS.slateL}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:tab===t.id?700:400,color:tab===t.id?DS.gold:DS.slateL}}>{t.label}</span></button>))}</div>
    </div>

    {/* Contenido */}
    <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>

      {/* ── TAB: MESA DE TRABAJO ── */}
      {tab==="mesa"&&(<>
        {/* Botón principal: Procesar con IA */}
        {!cerrado&&(<div style={{marginBottom:20}}>
          <SecLabel icon="ti-cpu">Procesar con agente IA</SecLabel>
          <div style={{background:tieneAnalisis?DS.greenL:`${DS.gold}08`,border:`1px solid ${tieneAnalisis?DS.green+"40":DS.goldLine}`,borderRadius:10,padding:"14px 16px"}}>
            {tieneAnalisis?(<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><i className="ti ti-circle-check" style={{fontSize:18,color:DS.green}} aria-hidden/><div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:DS.green}}>Agente procesó este caso</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>Análisis disponible — puedes reprocesar si lo necesitas</div></div></div>):(<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><i className="ti ti-brain" style={{fontSize:18,color:DS.gold}} aria-hidden/><div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:DS.ink}}>Sin análisis del agente</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>El agente de {caso.area} procesará el caso con RAG legal</div></div></div>)}
            <button onClick={handleProcesar} disabled={procesando} style={{width:"100%",padding:"10px",background:procesando?DS.slateXL:DS.ink,border:`1px solid ${DS.goldLine}`,borderRadius:7,cursor:procesando?"not-allowed":"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.gold,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"background .15s"}} onMouseEnter={e=>{if(!procesando)e.currentTarget.style.background=DS.inkM;}} onMouseLeave={e=>{if(!procesando)e.currentTarget.style.background=DS.ink;}}>
              {procesando?<><i className="ti ti-loader-2" style={{fontSize:16,animation:"spin 1s linear infinite"}} aria-hidden/>Enviando al agente…</>:<><i className="ti ti-wand" style={{fontSize:16}} aria-hidden/>{tieneAnalisis?"Reprocesar con IA →":"Procesar con agente IA →"}</>}
            </button>
          </div>
        </div>)}

        {/* Análisis del agente */}
        {tieneAnalisis&&(<>
          <SecLabel icon="ti-cpu">Análisis del agente</SecLabel>
          <div style={{background:`${DS.gold}09`,border:`1px solid ${DS.goldLine}`,borderRadius:8,padding:"13px 16px",marginBottom:16}}>
            <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.inkM,margin:0,lineHeight:1.65}}>{caso.resumenIA}</p>
          </div>
        </>)}

        {/* Acciones pendientes del agente */}
        {caso.acciones&&caso.acciones.length>0&&(<>
          <SecLabel icon="ti-checklist">Acciones recomendadas por el agente</SecLabel>
          <div style={{marginBottom:16}}>{caso.acciones.map((a,i)=>(<div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 12px",background:DS.creamM,borderRadius:7,marginBottom:5}}><div style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${DS.slateXL}`,flexShrink:0,marginTop:1}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,lineHeight:1.5}}>{typeof a==="string"?a:JSON.stringify(a)}</span></div>))}</div>
        </>)}

        {/* Fuentes RAG */}
        {caso.fuentesRAG&&caso.fuentesRAG.length>0&&(<>
          <SecLabel icon="ti-database">Fuentes RAG utilizadas</SecLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>{caso.fuentesRAG.map((f,i)=>(<span key={i} style={{fontFamily:"'Outfit',sans-serif",fontSize:10,background:DS.goldFaint,color:DS.gold,padding:"3px 9px",borderRadius:4,border:`1px solid ${DS.goldLine}`}}>{typeof f==="string"?f:JSON.stringify(f)}</span>))}</div>
        </>)}

        {/* Nota del abogado */}
        {!cerrado&&(<>
          <SecLabel icon="ti-pencil">Nota del abogado</SecLabel>
          <textarea value={nota} onChange={e=>setNota(e.target.value)} placeholder="Análisis propio, instrucciones, observaciones legales…" style={{width:"100%",minHeight:90,background:DS.cream,border:`1px solid ${DS.creamDD}`,borderRadius:8,boxSizing:"border-box",padding:"10px 13px",fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.ink,resize:"vertical",outline:"none",lineHeight:1.5,marginBottom:8}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
            <button onClick={handleGuardarNota} disabled={guardandoNota} style={{padding:"7px 16px",borderRadius:6,border:`1px solid ${DS.creamDD}`,background:DS.white,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:600,color:DS.slate,display:"flex",alignItems:"center",gap:5}} onMouseEnter={e=>{e.currentTarget.style.borderColor=DS.gold;e.currentTarget.style.color=DS.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=DS.creamDD;e.currentTarget.style.color=DS.slate;}}>
              <i className="ti ti-device-floppy" style={{fontSize:12}} aria-hidden/>{guardandoNota?"Guardando…":"Guardar nota"}
            </button>
          </div>
        </>)}

        {/* Acciones rápidas */}
        {!cerrado&&(<>
          <SecLabel icon="ti-bolt">Acciones</SecLabel>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <AcBtn icon="ti-check" label="Aprobar y enviar" sub="Envía respuesta al cliente" color={DS.green} onClick={()=>onAccion(caso.uuid,"aprobar",{nota})} disabled={!tieneAnalisis}/>
            <AcBtn icon="ti-alarm" label="Escalar caso" sub="Notifica Slack del área" color={DS.amber} onClick={()=>onAccion(caso.uuid,"escalar",null)}/>
          </div>
          {!tieneAnalisis&&<p style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,marginTop:6}}>* Aprobar requiere análisis del agente primero.</p>}
        </>)}
      </>)}

      {/* ── TAB: RESUMEN ── */}
      {tab==="resumen"&&(<>
        <SecLabel icon="ti-user">Datos del cliente</SecLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>{[{icon:"ti-user",label:"Nombre",val:caso.contacto.nombre},{icon:"ti-id",label:"RUT",val:caso.rut},{icon:"ti-mail",label:"Email",val:caso.contacto.email},{icon:"ti-phone",label:"Teléfono",val:caso.contacto.tel}].map(({icon,label,val})=>(<div key={label} style={{background:DS.creamM,borderRadius:7,padding:"9px 12px",display:"flex",gap:8,alignItems:"flex-start"}}><i className={`ti ${icon}`} style={{fontSize:14,color:DS.slateL,marginTop:1,flexShrink:0}} aria-hidden/><div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:1}}>{label}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,fontWeight:500}}>{val||"-"}</div></div></div>))}</div>
        {tieneAnalisis&&(<><SecLabel icon="ti-cpu">Análisis IA</SecLabel><div style={{background:`${DS.gold}09`,border:`1px solid ${DS.goldLine}`,borderRadius:8,padding:"13px 16px",marginBottom:16}}><p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.inkM,margin:0,lineHeight:1.65}}>{caso.resumenIA}</p></div></>)}
        {caso.notaAbogado&&(<><SecLabel icon="ti-pencil">Nota del abogado</SecLabel><div style={{background:DS.blueL,border:`1px solid ${DS.blue}30`,borderRadius:8,padding:"12px 14px",marginBottom:16}}><p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.blue,margin:0,lineHeight:1.6}}>{caso.notaAbogado}</p></div></>)}
        {caso.leccion&&(<><SecLabel icon="ti-brain">Lección aprendida</SecLabel><div style={{background:DS.greenL,border:`1px solid ${DS.green}30`,borderRadius:8,padding:"12px 14px"}}><p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.green,margin:0,lineHeight:1.6}}>{caso.leccion}</p></div></>)}
      </>)}

      {/* ── TAB: HISTORIAL ── */}
      {tab==="historial"&&(<><SecLabel icon="ti-timeline">Línea de tiempo</SecLabel>{caso.historial.map((h,i)=>{const cfgMap={sistema:{bg:DS.creamD,txt:DS.slate,lbl:"SIS"},ia:{bg:DS.goldFaint,txt:DS.gold,lbl:"IA"},abogado:{bg:DS.blueL,txt:DS.blue,lbl:"ABG"}};const c=cfgMap[h.tipo]||cfgMap.sistema;return(<div key={i} style={{display:"flex",gap:10,marginBottom:14}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}><div style={{width:28,height:28,borderRadius:"50%",background:c.bg,border:`1px solid ${c.txt}30`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:800,color:c.txt}}>{c.lbl}</span></div><div style={{width:1,flex:1,background:DS.creamD,marginTop:4}}/></div><div style={{paddingBottom:4}}><div style={{display:"flex",gap:8,alignItems:"baseline",marginBottom:3}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:c.txt}}>{h.actor}</span><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{fmtShort(h.ts)}</span></div><p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.slate,margin:0,lineHeight:1.55}}>{h.msg}</p></div></div>);})}</>)}

      {/* ── TAB: CIERRE ── */}
      {tab==="cerrar"&&!cerrado&&(<>
        <SecLabel icon="ti-brain">Lección aprendida → RAG</SecLabel>
        <div style={{background:`${DS.gold}08`,border:`1px solid ${DS.goldLine}`,borderRadius:8,padding:"12px 14px",marginBottom:12}}>
          <p style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL,margin:"0 0 8px",lineHeight:1.5}}>Se guardará en Supabase y alimentará el RAG del sistema.</p>
          <textarea value={leccion} onChange={e=>setLeccion(e.target.value)} placeholder="Ej: 'Art. 192 CT aplica incluso en segunda omisión…'" style={{width:"100%",minHeight:80,background:DS.white,border:`1px solid ${DS.goldLine}`,borderRadius:7,boxSizing:"border-box",padding:"9px 12px",fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,resize:"vertical",outline:"none",lineHeight:1.5}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.goldLine}/>
        </div>
        <SecLabel icon="ti-bolt">Acción final</SecLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
          <AcBtn icon="ti-circle-check" label="Cerrar caso con lección" sub="Guarda lección y marca para retro-loop RAG" color={DS.slate} onClick={()=>onAccion(caso.uuid,"cerrar",{leccion})}/>
        </div>
      </>)}
    </div>
  </div>);}

// ─── PANTALLA CASOS ───────────────────────────────────────────────────────────
function PantallaCasos({casos,actualizarEstado,actualizarNota,actualizarDatos,eliminarCaso,cerrarCaso,showToast}){
  const[selId,setSelId]=useState(null);
  const[search,setSearch]=useState("");
  const[filtroEstado,setFiltroEstado]=useState("TODOS");
  const[filtroArea,setFiltroArea]=useState("TODAS");
  const[modalEditar,setModalEditar]=useState(null);
 const[modalEliminar,setModalEliminar]=useState(null);
const[modalNuevo,setModalNuevo]=useState(false);

  useEffect(()=>{if(casos.length>0&&!selId)setSelId(casos[0].uuid);},[casos,selId]);
  const selCaso=casos.find(c=>c.uuid===selId);
  const filtered=casos.filter(c=>{
    const okE=filtroEstado==="TODOS"||c.estado===filtroEstado;
    const okA=filtroArea==="TODAS"||c.area===filtroArea;
    const q=search.toLowerCase();
    const okS=!q||c.cliente.toLowerCase().includes(q)||c.id.toLowerCase().includes(q)||(c.rut||"").includes(q)||(c.asunto||"").toLowerCase().includes(q);
    return okE&&okA&&okS;
  });

  const areas=["TODAS",...[...new Set(casos.map(c=>c.area).filter(Boolean))]];

  async function handleAccion(casoUuid,tipo,data){
    if(tipo==="cambiarEstado"){
      const e=await actualizarEstado(casoUuid,data);
      if(e)showToast("Error al cambiar estado","err");
      else showToast(`Estado → ${ESTADO_CFG[data]?.label||data}`,"ok");
      return;
    }
    if(tipo==="guardarNota"){
      const e=await actualizarNota(casoUuid,data);
      if(e)showToast("Error al guardar nota","err");
      else showToast("Nota guardada en Supabase","ok");
      return;
    }
    if(tipo==="procesar"){
      const caso=casos.find(c=>c.uuid===casoUuid);
      if(!caso)return;
      showToast("Enviando al agente IA…","info");
      await actualizarEstado(casoUuid,"EN_REVISION");
      const r=await dispararWebhook(WH.procesar,{caso_id:casoUuid,area:caso.area});
      if(r.ok)showToast("Agente procesando — el dashboard se actualizará solo","ok");
      else showToast("Error al conectar con n8n","err");
      return;
    }
    if(tipo==="aprobar"){
      const caso=casos.find(c=>c.uuid===casoUuid);
      showToast("Enviando aprobación…","info");
      const r=await dispararWebhook(WH.aprobar,{caso_id:casoUuid,nota:data?.nota||"",folio:caso?.id,contacto_email:caso?.contacto?.email,contacto_nombre:caso?.contacto?.nombre});
      if(r.ok){await actualizarEstado(casoUuid,"CERRADO");showToast("Borrador aprobado y enviado al cliente","ok");}
      else showToast("Error al aprobar","err");
      return;
    }
    if(tipo==="escalar"){
      showToast("Escalando caso…","info");
      const caso=casos.find(c=>c.uuid===casoUuid);
      const r=await dispararWebhook(WH.escalar,{caso_id:casoUuid,area:caso?.area,folio:caso?.id});
      if(r.ok){await actualizarEstado(casoUuid,"ESCALADO");showToast("Caso escalado — notificación enviada a Slack","warn");}
      else{await actualizarEstado(casoUuid,"ESCALADO");showToast("Caso escalado en Supabase","warn");}
      return;
    }
    if(tipo==="cerrar"){
      const e=await cerrarCaso(casoUuid,data?.leccion||"");
      if(e)showToast("Error al cerrar caso","err");
      else{
        if(data?.leccion){
          await dispararWebhook(WH.cerrar,{caso_id:casoUuid,leccion:data.leccion});
        }
        showToast("Caso cerrado y lección guardada en Supabase","ok");
      }
      return;
    }
  }

  async function handleSaveEditar(form){
    const e=await actualizarDatos(selCaso.uuid,form);
    if(e)showToast("Error al actualizar","err");
    else{showToast("Guardado en Supabase","ok");setModalEditar(null);}
  }
 async function handleCrearCaso(form){
  const folio="PER-"+Math.random().toString(36).substr(2,8).toUpperCase();
  const{error:e}=await supabase.from("casos").insert({folio,contacto_nombre:form.nombre,cliente_rut:form.rut_persona||"Sin RUT",contacto_email:form.email,contacto_tel:form.tel,cliente_empresa:form.empresa,area:form.area,kit:form.kit,canal:form.canal,prioridad:form.prioridad,asunto:form.asunto||form.consulta_raw.substring(0,120),consulta_raw:form.consulta_raw,estado:"HITL",sla_horas:48,ingresado_at:new Date().toISOString()});
  if(e)showToast("Error al crear caso","err");
  else{showToast("Caso creado correctamente","ok");setModalNuevo(false);}
}
  
    async function handleEliminar(){
      const uuid=modalEliminar.uuid;
    const e=await eliminarCaso(uuid);
    if(e)showToast("Error al eliminar","err");
    else{showToast("Caso eliminado","warn");setModalEliminar(null);const next=casos.find(c=>c.uuid!==uuid);setSelId(next?.uuid||null);}
  }

  return(<>{modalNuevo&&<ModalNuevoCaso onSave={handleCrearCaso} onClose={()=>setModalNuevo(false)}/>{modalEditar&&<ModalEditar caso={modalEditar} onSave={handleSaveEditar} onClose={()=>setModalEditar(null)}/>}{modalEliminar&&<ModalEliminar caso={modalEliminar} onConfirm={handleEliminar} onClose={()=>setModalEliminar(null)}/>}
    <div style={{display:"flex",flex:1,overflow:"hidden"}}>
      {/* Lista */}
      <div style={{width:300,background:DS.white,borderRight:`1px solid ${DS.creamD}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"14px 16px 10px",background:DS.cream,borderBottom:`1px solid ${DS.creamD}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.ink}}>Casos</span><button onClick={()=>setModalNuevo(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:6,border:"none",background:DS.ink,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:600,color:DS.gold}}><i className="ti ti-plus" style={{fontSize:12}} aria-hidden/>Nuevo</button><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{filtered.length} / {casos.length}</span></div>
          <div style={{position:"relative",marginBottom:8}}><i className="ti ti-search" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:13,color:DS.slateL}} aria-hidden/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, RUT, folio, asunto…" style={{width:"100%",paddingLeft:30,height:32,background:DS.white,border:`1px solid ${DS.creamDD}`,borderRadius:7,boxSizing:"border-box",fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,outline:"none"}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/></div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>{["TODOS","HITL","ESCALADO","EN_REVISION","CERRADO"].map(e=>{const cfg=ESTADO_CFG[e];const a=filtroEstado===e;return(<button key={e} onClick={()=>setFiltroEstado(e)} style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:4,cursor:"pointer",border:`1px solid ${a?(cfg?.dot||DS.gold):DS.creamDD}`,background:a?(cfg?cfg.bg:DS.goldFaint):"transparent",color:a?(cfg?.txt||DS.gold):DS.slateL}}>{e==="TODOS"?"Todos":cfg?.label||e}</button>);})}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{areas.slice(0,6).map(a=>{const active=filtroArea===a;return(<button key={a} onClick={()=>setFiltroArea(a)} style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:4,cursor:"pointer",border:`1px solid ${active?(AREA_COLOR[a]||DS.gold):DS.creamDD}`,background:active?`${(AREA_COLOR[a]||DS.gold)}20`:"transparent",color:active?(AREA_COLOR[a]||DS.gold):DS.slateL}}>{a==="TODAS"?"Todas":a}</button>);})}</div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>{filtered.length===0&&<div style={{padding:"40px 20px",textAlign:"center"}}><i className="ti ti-search-off" style={{fontSize:32,color:DS.slateXL,display:"block",marginBottom:8}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL}}>Sin resultados</span></div>}{filtered.map(c=>(<CasoRow key={c.uuid} caso={c} selected={selId===c.uuid} onClick={()=>setSelId(c.uuid)}/>))}</div>
      </div>
      {/* Detalle */}
      <div style={{flex:1,overflow:"hidden"}}>{selCaso?<CasoDetail caso={selCaso} onAccion={handleAccion} onEditar={c=>setModalEditar(c)} onEliminar={c=>setModalEliminar(c)} showToast={showToast}/>:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",flexDirection:"column",gap:12}}><i className="ti ti-briefcase" style={{fontSize:40,color:DS.slateXL}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:DS.slateL}}>Selecciona un caso</span></div>}</div>
    </div>
  </>);}

// ─── PANTALLAS SECUNDARIAS (sin cambios respecto v6) ──────────────────────────
function PantallaPlazos(){
  const[plazos,setPlazos]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState(null);

  useEffect(()=>{
    async function fetchPlazos(){
      try{
        const{data,error:err}=await supabase.from("plazos_legales").select("*").order("fecha_vence",{ascending:true});
        if(err)throw err;
        const mapped=(data||[]).map(p=>{
          const hoy=new Date();hoy.setHours(0,0,0,0);
          const vence=new Date(p.fecha_vence);vence.setHours(0,0,0,0);
          const diff=Math.round((vence-hoy)/(1000*60*60*24));
          return{
            id:p.id,tipo:p.tipo||"General",subtipo:p.subtipo||"",
            cliente:p.asunto?.split("—")[0]?.trim()||"Cliente",
            asunto:p.asunto||"Sin asunto",fecha:p.fecha_vence,
            diasRestantes:diff,
            urgencia:diff<=3?"critica":diff<=7?"alta":diff<=15?"media":"baja",
            estado:p.estado||"pendiente",ref:p.caso_id||"-",
            gestionado:p.estado==="cumplido"||p.estado==="gestionado",
          };
        });
        setPlazos(mapped);
      }catch(e){setError(e.message);}
      finally{setLoading(false);}
    }
    fetchPlazos();
    const ch=supabase.channel("plazos_rt").on("postgres_changes",{event:"*",schema:"public",table:"plazos_legales"},fetchPlazos).subscribe();
    return()=>supabase.removeChannel(ch);
  },[]);

  async function marcarGestionado(id){
    await supabase.from("plazos_legales").update({estado:"gestionado"}).eq("id",id);
    setPlazos(p=>p.map(x=>x.id===id?{...x,gestionado:true}:x));
  }

  if(loading)return(<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,background:DS.creamM}}><i className="ti ti-loader-2" style={{fontSize:32,color:DS.slateXL}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL}}>Cargando plazos…</span></div>);
  if(error)return(<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,background:DS.creamM}}><i className="ti ti-alert-triangle" style={{fontSize:32,color:DS.red}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL}}>{error}</span></div>);

  const grupos=[
    {label:"Críticos (≤7 días)",items:plazos.filter(p=>p.diasRestantes<=7&&!p.gestionado)},
    {label:"Próximos (8–15 días)",items:plazos.filter(p=>p.diasRestantes>7&&p.diasRestantes<=15&&!p.gestionado)},
    {label:"En el horizonte",items:plazos.filter(p=>p.diasRestantes>15&&!p.gestionado)},
    {label:"Gestionados",items:plazos.filter(p=>p.gestionado)},
  ];

  return(<div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:DS.creamM}}>
    <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>Agenda Legal Crítica</h1>
    <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,margin:"0 0 24px"}}>Vencimientos activos — marcas INAPI, SII, DT y contratos · {plazos.length} plazos</p>
    {plazos.length===0&&(<div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:"60px 0"}}><i className="ti ti-calendar-check" style={{fontSize:40,color:DS.slateXL}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:DS.slateL}}>Sin plazos activos</span></div>)}
    {grupos.map(({label,items})=>(items.length>0&&(<div key={label} style={{marginBottom:28}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</span><div style={{flex:1,height:1,background:DS.creamD}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{items.length}</span></div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{items.map(p=>{
        const uc=URGENCIA_CFG[p.urgencia]||URGENCIA_CFG.baja;
        const diasLabel=p.gestionado?"✓":p.diasRestantes<0?"VENCIDO":p.diasRestantes===0?"HOY":p.diasRestantes===1?"Mañana":`${p.diasRestantes}d`;
        return(<Card key={p.id} style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:14,opacity:p.gestionado?0.65:1}}>
          <div style={{width:56,height:56,borderRadius:10,background:p.gestionado?DS.greenL:p.diasRestantes<0?DS.redL:uc.bg,border:`1px solid ${p.gestionado?DS.green:p.diasRestantes<0?DS.red:uc.color}30`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:p.diasRestantes<0?14:20,fontWeight:700,color:p.gestionado?DS.green:p.diasRestantes<0?DS.red:uc.color,lineHeight:1}}>{diasLabel}</span>
            {!p.gestionado&&p.diasRestantes>1&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:8,color:uc.color,fontWeight:600}}>días</span>}
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:uc.color,background:uc.bg,padding:"2px 8px",borderRadius:4}}>{p.tipo}</span>
              {p.subtipo&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{p.subtipo}</span>}
            </div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.ink,marginBottom:2}}>{p.cliente}</div>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.slate}}>{p.asunto}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
            <div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>Vence</div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,fontWeight:700,color:DS.ink}}>{new Date(p.fecha).toLocaleDateString("es-CL",{day:"2-digit",month:"short"})}</div></div>
            {!p.gestionado&&<button onClick={()=>marcarGestionado(p.id)} style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${DS.green}`,background:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.green,whiteSpace:"nowrap"}} onMouseEnter={e=>{e.currentTarget.style.background=DS.green;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=DS.green;}}>Marcar gestionado</button>}
          </div>
        </Card>);
      })}</div>
    </div>)))}
  </div>);}
function PantallaClientes({casos}){
  const[sel,setSel]=useState(null);
  const clientesMap=casos.reduce((acc,c)=>{const key=c.rut||c.cliente;if(!acc[key])acc[key]={rut:c.rut,nombre:c.cliente,casos:[]};acc[key].casos.push(c);return acc;},{});
  const clientes=Object.values(clientesMap);
  const cliente=sel!=null?clientes[sel]:null;
  return(<div style={{display:"flex",flex:1,overflow:"hidden"}}>
    <div style={{width:280,background:DS.white,borderRight:`1px solid ${DS.creamD}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"14px 16px",background:DS.cream,borderBottom:`1px solid ${DS.creamD}`,flexShrink:0}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.ink}}>Clientes</span><div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL,marginTop:2}}>{clientes.length} clientes · {casos.length} casos</div></div>
      <div style={{flex:1,overflowY:"auto"}}>{clientes.map((cl,i)=>(<div key={i} onClick={()=>setSel(i)} style={{padding:"12px 16px",borderBottom:`1px solid ${DS.creamD}`,cursor:"pointer",background:sel===i?DS.goldFaint:DS.white,borderLeft:`3px solid ${sel===i?DS.gold:"transparent"}`}} onMouseEnter={e=>{if(sel!==i)e.currentTarget.style.background=DS.creamM;}} onMouseLeave={e=>{if(sel!==i)e.currentTarget.style.background=DS.white;}}><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.ink,marginBottom:2}}>{cl.nombre}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>RUT {cl.rut} · {cl.casos.length} caso{cl.casos.length!==1?"s":""}</div></div>))}</div>
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"24px 28px",background:DS.creamM}}>{cliente?(<><h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>{cliente.nombre}</h2><p style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.slateL,margin:"0 0 20px"}}>RUT {cliente.rut} · {cliente.casos.length} caso{cliente.casos.length!==1?"s":""}</p><div style={{display:"flex",flexDirection:"column",gap:10}}>{cliente.casos.map(c=>{const est=ESTADO_CFG[c.estado]||ESTADO_CFG.PENDIENTE;return(<Card key={c.uuid} style={{padding:"14px 16px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:DS.gold}}>{c.id}</span><Chip label={est.label} dot={est.dot} bg={est.bg} txt={est.txt} size={9}/></div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.ink,marginBottom:4}}>{c.asunto}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{c.area} · {fmtDate(c.ingreso)}</div></Card>);})}</div></>):(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",flexDirection:"column",gap:12}}><i className="ti ti-building-store" style={{fontSize:40,color:DS.slateXL}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:14,color:DS.slateL}}>Selecciona un cliente</span></div>)}</div>
  </div>);}

function PantallaMetricas({casos}){
  const total=casos.length;const cerrados=casos.filter(c=>c.estado==="CERRADO").length;const hitl=casos.filter(c=>c.estado==="HITL").length;const escalados=casos.filter(c=>c.estado==="ESCALADO").length;const conAnalisis=casos.filter(c=>c.resumenIA&&c.resumenIA.length>10).length;
  const porArea=Object.entries(casos.reduce((a,c)=>{a[c.area]=(a[c.area]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]);
  const confPromedio=casos.filter(c=>c.confianza>0).reduce((s,c)=>s+c.confianza,0)/Math.max(casos.filter(c=>c.confianza>0).length,1);
  return(<div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:DS.creamM}}>
    <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>Métricas</h1>
    <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,margin:"0 0 24px"}}>Estado operativo del sistema</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>{[{label:"Total casos",val:total,icon:"ti-inbox",color:DS.ink},{label:"Con análisis IA",val:conAnalisis,icon:"ti-cpu",color:DS.purple},{label:"HITL pendientes",val:hitl,icon:"ti-alert-triangle",color:DS.amber},{label:"Confianza prom.",val:`${Math.round(confPromedio*100)}%`,icon:"ti-chart-bar",color:DS.green}].map(({label,val,icon,color})=>(<Card key={label} style={{padding:"16px 18px"}}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}><i className={`ti ${icon}`} style={{fontSize:16,color}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span></div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:700,color:DS.ink}}>{val}</div></Card>))}</div>
    <Card style={{padding:"20px 24px",marginBottom:20}}><SecLabel icon="ti-chart-bar">Casos por área</SecLabel>{porArea.map(([area,cnt])=>(<div key={area} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,width:90}}>{area}</span><div style={{flex:1,height:22,background:DS.creamM,borderRadius:4,overflow:"hidden"}}><div style={{width:`${(cnt/total)*100}%`,height:"100%",background:AREA_COLOR[area]||DS.slate,borderRadius:4,transition:"width .6s"}}/></div><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.ink,minWidth:24}}>{cnt}</span></div>))}</Card>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{[{label:"Casos cerrados",val:cerrados,total,color:DS.green},{label:"Casos escalados",val:escalados,total,color:DS.red}].map(({label,val,total,color})=>(<Card key={label} style={{padding:"16px 18px"}}><SecLabel>{label}</SecLabel><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:700,color:DS.ink,marginBottom:8}}>{val}</div><Bar pct={total>0?(val/total)*100:0} color={color} height={6}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{total>0?Math.round((val/total)*100):0}% del total</span></Card>))}</div>
  </div>);}

function PantallaSystem(){
  const agentes=[{id:"A0",nombre:"Cerebro",canal:"Router + Clasificador",estado:"ok",color:DS.gold},{id:"A1",nombre:"Contratos",canal:"contratos-intake",estado:"ok",color:DS.slate},{id:"A2",nombre:"Marcas INAPI",canal:"marcas-intake",estado:"ok",color:DS.purple},{id:"A3",nombre:"Laboral DT",canal:"a3-laboral",estado:"ok",color:DS.amber},{id:"A4",nombre:"Tributario SII",canal:"tributario-intake",estado:"ok",color:DS.green},{id:"A5",nombre:"Societario",canal:"societario-intake",estado:"ok",color:DS.blue},{id:"A6",nombre:"Consumidor",canal:"consumidor-intake",estado:"ok",color:DS.inkM},{id:"A7",nombre:"Cobranza",canal:"cobranza-intake",estado:"ok",color:DS.red}];
  const estadoCfg={ok:{label:"Activo",color:DS.green,icon:"ti-circle-check"},warn:{label:"Alerta",color:DS.amber,icon:"ti-alert-triangle"},err:{label:"Error",color:DS.red,icon:"ti-x"}};
  return(<div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:DS.creamM}}>
    <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>Sistema IA</h1>
    <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,margin:"0 0 20px"}}>Estado de agentes y orquestador n8n</p>
    <Card style={{padding:"16px 20px",marginBottom:20,background:DS.ink,border:`1px solid ${DS.goldLine}`}}><div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:44,height:44,borderRadius:10,background:DS.goldFaint,border:`1px solid ${DS.goldLine}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-brain" style={{fontSize:22,color:DS.gold}} aria-hidden/></div><div style={{flex:1}}><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.gold}}>n8n Orquestador</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>n8n.srv1108143.hstgr.cloud · Supabase conectado · Realtime activo</div></div><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:DS.green,boxShadow:`0 0 8px ${DS.green}`}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:DS.green}}>Operativo</span></div></div></Card>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>{agentes.map(ag=>{const s=estadoCfg[ag.estado];return(<Card key={ag.id} style={{padding:"16px 18px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:8,background:ag.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:800,color:"#fff"}}>{ag.id}</span></div><div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.ink}}>{ag.nombre}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL}}>{ag.canal}</div></div></div><div style={{display:"flex",alignItems:"center",gap:5}}><i className={`ti ${s.icon}`} style={{fontSize:14,color:s.color}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:s.color}}>{s.label}</span></div></div></Card>);})}</div>
  </div>);}

function PantallaRAG(){
  const[filtroArea,setFiltroArea]=useState("TODAS");const[busqueda,setBusqueda]=useState("");
  const areas=["TODAS",...[...new Set(RAG_FUENTES.map(f=>f.area))]];
  const totalChunks=RAG_FUENTES.reduce((s,f)=>s+f.chunks,0);
  const porArea=[...new Set(RAG_FUENTES.map(f=>f.area))].map(a=>({area:a,chunks:RAG_FUENTES.filter(f=>f.area===a).reduce((s,f)=>s+f.chunks,0),fuentes:RAG_FUENTES.filter(f=>f.area===a).length,color:AREA_COLOR[a]||DS.slate}));
  const filtered=RAG_FUENTES.filter(f=>{const okA=filtroArea==="TODAS"||f.area===filtroArea;const q=busqueda.toLowerCase();const okB=!q||f.nombre.toLowerCase().includes(q)||f.area.toLowerCase().includes(q);return okA&&okB;});
  return(<div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:DS.creamM}}>
    <div style={{marginBottom:20}}><h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>RAG y Fuentes</h1><p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,margin:0}}>Base de conocimiento legal vectorial — {RAG_FUENTES.length} fuentes · {totalChunks.toLocaleString("es-CL")} chunks</p></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>{[{label:"Fuentes indexadas",val:RAG_FUENTES.length,icon:"ti-file-text",color:DS.blue},{label:"Chunks totales",val:totalChunks.toLocaleString("es-CL"),icon:"ti-layers",color:DS.purple},{label:"Templates",val:KPIS_STATIC.ragTemplates,icon:"ti-template",color:DS.gold},{label:"Alertas",val:RAG_FUENTES.filter(f=>f.estado==="warn").length,icon:"ti-alert-triangle",color:DS.amber}].map(({label,val,icon,color})=>(<Card key={label} style={{padding:"16px 18px"}}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}><i className={`ti ${icon}`} style={{fontSize:16,color}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span></div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink}}>{val}</div></Card>))}</div>
    <Card style={{padding:"20px 24px",marginBottom:20}}><SecLabel icon="ti-chart-bar">Distribución por área</SecLabel>{porArea.sort((a,b)=>b.chunks-a.chunks).map(({area,chunks,fuentes,color})=>(<div key={area} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,width:100}}>{area}</span><div style={{flex:1,height:22,background:DS.creamM,borderRadius:4,overflow:"hidden"}}><div style={{width:`${(chunks/totalChunks)*100}%`,height:"100%",background:color,borderRadius:4,transition:"width .6s"}}/></div><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.ink,minWidth:60,textAlign:"right"}}>{chunks.toLocaleString("es-CL")}</span><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slateL,minWidth:70}}>{fuentes} fuente{fuentes!==1?"s":""}</span></div>))}</Card>
    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}><div style={{position:"relative",flex:1,maxWidth:320}}><i className="ti ti-search" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:13,color:DS.slateL}} aria-hidden/><input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar fuente…" style={{width:"100%",paddingLeft:30,height:34,background:DS.white,border:`1px solid ${DS.creamDD}`,borderRadius:7,boxSizing:"border-box",fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,outline:"none"}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/></div>{areas.map(a=>(<button key={a} onClick={()=>setFiltroArea(a)} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${filtroArea===a?DS.gold:DS.creamDD}`,background:filtroArea===a?DS.goldFaint:"transparent",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:filtroArea===a?700:400,color:filtroArea===a?DS.gold:DS.slate}}>{a}</button>))}</div>
    <Card style={{overflow:"hidden"}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:DS.creamM}}>{["ID","Nombre","Área","Chunks","Tamaño","Actualización","Estado"].map(h=>(<th key={h} style={{padding:"10px 14px",fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",textAlign:"left",borderBottom:`1px solid ${DS.creamD}`,whiteSpace:"nowrap"}}>{h}</th>))}</tr></thead><tbody>{filtered.map((f,i)=>(<tr key={f.id} style={{borderBottom:`1px solid ${DS.creamD}`,background:i%2===0?DS.white:DS.cream}}><td style={{padding:"10px 14px",fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{f.id}</td><td style={{padding:"10px 14px",fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:DS.ink,maxWidth:240}}><div style={{display:"flex",alignItems:"center",gap:7}}><i className="ti ti-file-text" style={{fontSize:14,color:AREA_COLOR[f.area]||DS.slate,flexShrink:0}} aria-hidden/>{f.nombre}</div></td><td style={{padding:"10px 14px"}}><span style={{background:(AREA_COLOR[f.area]||DS.slate)+"20",color:AREA_COLOR[f.area]||DS.slate,padding:"2px 8px",borderRadius:4,fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700}}>{f.area}</span></td><td style={{padding:"10px 14px",fontFamily:"'Cormorant Garamond',serif",fontSize:16,fontWeight:700,color:DS.ink}}>{f.chunks.toLocaleString("es-CL")}</td><td style={{padding:"10px 14px",fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{f.size}</td><td style={{padding:"10px 14px",fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{new Date(f.fecha).toLocaleDateString("es-CL")}</td><td style={{padding:"10px 14px"}}>{f.estado==="ok"?<span style={{display:"inline-flex",alignItems:"center",gap:4,background:DS.greenL,color:DS.green,padding:"2px 8px",borderRadius:4,fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700}}><i className="ti ti-circle-check" style={{fontSize:12}} aria-hidden/>OK</span>:<span style={{display:"inline-flex",alignItems:"center",gap:4,background:DS.amberL,color:DS.amber,padding:"2px 8px",borderRadius:4,fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700}}><i className="ti ti-alert-triangle" style={{fontSize:12}} aria-hidden/>Revisar</span>}</td></tr>))}</tbody></table></div></Card>
  </div>);}

function PantallaConfig({showToast}){
  const[umbralHITL,setUmbralHITL]=useState(65);const[slaDefault,setSlaDefault]=useState(48);const[notifSlack,setNotifSlack]=useState(true);const[notifEmail,setNotifEmail]=useState(true);
  const[usuarios,setUsuarios]=useState([{id:1,nombre:"Kurt Leupin",email:"pymeenregla@gmail.com",rol:"Admin",activo:true}]);
  const[nuevoNombre,setNuevoNombre]=useState("");const[nuevoEmail,setNuevoEmail]=useState("");
  const conexiones=[{nombre:"Supabase (PostgreSQL + pgvector)",estado:"ok",url:"kwyicmnbquqpuoxmsxgt.supabase.co",detalle:"São Paulo · Realtime activo"},{nombre:"n8n (Orquestador)",estado:"ok",url:"n8n.srv1108143.hstgr.cloud",detalle:"Hostinger VPS 8GB · A0–A7 activos"},{nombre:"Clerk (Autenticación)",estado:"ok",url:"pyme-en-regla-dashboard.clerk.accounts.dev",detalle:"Development mode activo"},{nombre:"Slack (Notificaciones HITL)",estado:"ok",url:"pyme-en-regla.slack.com",detalle:"7 canales activos"},{nombre:"Gmail (Confirmaciones)",estado:"ok",url:"OAuth2 per-n8n-496803",detalle:"Envíos automáticos activos"},{nombre:"OpenAI (Embeddings)",estado:"ok",url:"text-embedding-3-small",detalle:"Vectorización activa"},{nombre:"Claude (Agentes IA)",estado:"ok",url:"claude-sonnet-4 + haiku",detalle:"A0 Haiku · A1–A7 Sonnet"}];
  const inp={padding:"8px 10px",borderRadius:6,border:`1px solid ${DS.creamDD}`,fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink,outline:"none",background:DS.white};
  function agregarUsuario(){if(!nuevoNombre||!nuevoEmail)return;setUsuarios(p=>[...p,{id:Date.now(),nombre:nuevoNombre,email:nuevoEmail,rol:"Abogado",activo:true}]);setNuevoNombre("");setNuevoEmail("");showToast("Usuario agregado","ok");}
  return(<div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:DS.creamM}}>
    <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:700,color:DS.ink,margin:"0 0 4px"}}>Configuración</h1>
    <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,margin:"0 0 24px"}}>Parámetros del sistema, usuarios y conexiones</p>
    <Card style={{padding:"20px 24px",marginBottom:20}}><SecLabel icon="ti-adjustments">Parámetros del sistema</SecLabel><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginTop:12}}><div><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:6}}>Umbral HITL (confianza mínima)</label><div style={{display:"flex",alignItems:"center",gap:12}}><input type="range" min={30} max={95} value={umbralHITL} onChange={e=>setUmbralHITL(Number(e.target.value))} style={{flex:1,accentColor:DS.gold}}/><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:DS.ink,minWidth:42}}>{umbralHITL}%</span></div></div><div><label style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:DS.slateL,textTransform:"uppercase",letterSpacing:"0.08em",display:"block",marginBottom:6}}>SLA por defecto (horas)</label><div style={{display:"flex",alignItems:"center",gap:12}}><input type="range" min={6} max={120} step={6} value={slaDefault} onChange={e=>setSlaDefault(Number(e.target.value))} style={{flex:1,accentColor:DS.gold}}/><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:DS.ink,minWidth:42}}>{slaDefault}h</span></div></div></div><div style={{display:"flex",gap:20,marginTop:20}}>{[{label:"Notificaciones Slack",val:notifSlack,set:setNotifSlack},{label:"Notificaciones Email",val:notifEmail,set:setNotifEmail}].map(({label,val,set})=>(<div key={label} style={{display:"flex",alignItems:"center",gap:10}}><button onClick={()=>set(!val)} style={{width:44,height:24,borderRadius:12,border:"none",background:val?DS.green:DS.slateXL,cursor:"pointer",position:"relative",transition:"background .2s"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:val?23:3,transition:"left .2s"}}/></button><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,color:DS.ink}}>{label}</span></div>))}</div><div style={{marginTop:16,display:"flex",justifyContent:"flex-end"}}><button onClick={()=>showToast("Configuración guardada","ok")} style={{padding:"9px 20px",borderRadius:7,border:"none",background:DS.ink,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.gold}}>Guardar cambios</button></div></Card>
    <Card style={{padding:"20px 24px",marginBottom:20}}><SecLabel icon="ti-users">Abogados y usuarios</SecLabel><div style={{marginBottom:16}}>{usuarios.map(u=>(<div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${DS.creamD}`}}><div style={{width:34,height:34,borderRadius:"50%",background:DS.ink,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:700,color:DS.gold}}>{u.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span></div><div style={{flex:1}}><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:u.activo?DS.ink:DS.slateL}}>{u.nombre}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{u.email} · {u.rol}</div></div><Chip label={u.rol} bg={u.rol==="Admin"?DS.goldFaint:DS.blueL} txt={u.rol==="Admin"?DS.gold:DS.blue} size={9}/></div>))}</div><div style={{background:DS.creamM,borderRadius:8,padding:"14px 16px"}}><p style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.slate,margin:"0 0 10px"}}>Agregar nuevo usuario</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input value={nuevoNombre} onChange={e=>setNuevoNombre(e.target.value)} placeholder="Nombre completo" style={{...inp,flex:1,minWidth:140}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/><input value={nuevoEmail} onChange={e=>setNuevoEmail(e.target.value)} placeholder="Email" style={{...inp,flex:1,minWidth:180}} onFocus={e=>e.target.style.borderColor=DS.gold} onBlur={e=>e.target.style.borderColor=DS.creamDD}/><button onClick={agregarUsuario} style={{padding:"8px 16px",borderRadius:6,border:"none",background:DS.ink,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:DS.gold}}>Agregar</button></div></div></Card>
    <Card style={{padding:"20px 24px"}}><SecLabel icon="ti-plug-connected">Conexiones del sistema</SecLabel><div style={{display:"flex",flexDirection:"column",gap:10,marginTop:8}}>{conexiones.map(c=>(<div key={c.nombre} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:DS.creamM,borderRadius:8}}><div style={{width:8,height:8,borderRadius:"50%",background:c.estado==="ok"?DS.green:DS.red,boxShadow:`0 0 6px ${c.estado==="ok"?DS.green:DS.red}`,flexShrink:0}}/><div style={{flex:1}}><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.ink}}>{c.nombre}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:11,color:DS.slateL}}>{c.url} · {c.detalle}</div></div><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:700,color:c.estado==="ok"?DS.green:DS.red,background:c.estado==="ok"?DS.greenL:DS.redL,padding:"3px 8px",borderRadius:4}}>{c.estado==="ok"?"Conectado":"Error"}</span></div>))}</div></Card>
  </div>);}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({nav,setNav,urgentes,totalCasos}){
  const items=[{id:"casos",icon:"ti-briefcase",label:"Mesa de trabajo"},{id:"plazos",icon:"ti-calendar-event",label:"Agenda legal"},{id:"clientes",icon:"ti-building-store",label:"Clientes"},{id:"metricas",icon:"ti-chart-line",label:"Métricas"},{id:"sistema",icon:"ti-cpu",label:"Sistema IA"},{id:"rag",icon:"ti-database",label:"RAG / Fuentes"},{id:"config",icon:"ti-settings",label:"Configuración"}];
  return(<div style={{width:212,background:DS.cream,borderRight:`1px solid ${DS.creamD}`,display:"flex",flexDirection:"column",flexShrink:0,height:"100vh",overflow:"hidden"}}>
    <div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${DS.creamD}`}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,background:DS.ink,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:`1px solid ${DS.goldLine}`}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:DS.gold}}>P</span></div><div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,fontWeight:700,color:DS.ink,lineHeight:1.1}}>Pyme En Regla</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL,letterSpacing:"0.12em",textTransform:"uppercase"}}>Mesa de Trabajo</div></div></div></div>
    <div style={{flex:1,paddingTop:8,overflowY:"auto"}}>
      {items.map(it=>{const active=nav===it.id;const badge=it.id==="casos"&&urgentes>0;return(<button key={it.id} onClick={()=>setNav(it.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 18px",background:active?DS.goldFaint:"transparent",border:"none",borderLeft:`2px solid ${active?DS.gold:"transparent"}`,cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{if(!active)e.currentTarget.style.background=DS.creamM;}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}><i className={`ti ${it.icon}`} style={{fontSize:17,color:active?DS.gold:DS.slateL,width:18,flexShrink:0}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:active?600:400,color:active?DS.gold:DS.slate,flex:1,textAlign:"left"}}>{it.label}</span>{badge&&<span style={{background:DS.red,color:"#fff",fontFamily:"'Outfit',sans-serif",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:10}}>{urgentes}</span>}</button>);})}
    </div>
    <div style={{padding:"10px 18px",borderTop:`1px solid ${DS.creamD}`,display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:DS.green,boxShadow:`0 0 6px ${DS.green}`}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,color:DS.slate}}>Supabase · {totalCasos} casos</span></div>
    <div style={{padding:"12px 18px",borderTop:`1px solid ${DS.creamD}`,display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",background:DS.ink,border:`1px solid ${DS.goldLine}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:700,color:DS.gold}}>KL</span></div><div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:12,fontWeight:600,color:DS.ink}}>Kurt Leupin</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateL}}>Abogado · Admin</div></div></div>
  </div>);}

// ─── TOPBAR ───────────────────────────────────────────────────────────────────
function TopBar({nav,urgentes,escalados,slaVencidos,lastUpdate,onRefresh}){
  const titles={casos:"Mesa de trabajo",plazos:"Agenda legal crítica",clientes:"Clientes",metricas:"Métricas del sistema",sistema:"Sistema multiagente IA",rag:"RAG y fuentes",config:"Configuración"};
  return(<div style={{height:52,background:DS.white,borderBottom:`1px solid ${DS.creamD}`,display:"flex",alignItems:"center",padding:"0 24px",justifyContent:"space-between",flexShrink:0}}>
    <span style={{fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.slate}}>{titles[nav]||"Panel PER"}</span>
    <div style={{display:"flex",alignItems:"center",gap:16}}>
      {[{label:"HITL",val:urgentes,color:DS.amber},{label:"Escalados",val:escalados,color:DS.red},{label:"SLA vencidos",val:slaVencidos,color:DS.red}].map(({label,val,color})=>(<div key={label} style={{textAlign:"center"}}><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:700,color:val>0?color:DS.slateXL,lineHeight:1}}>{val}</div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:8,color:DS.slateL,letterSpacing:"0.08em",textTransform:"uppercase"}}>{label}</div></div>))}
      {lastUpdate&&<span style={{fontFamily:"'Outfit',sans-serif",fontSize:9,color:DS.slateXL}}>{lastUpdate.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}</span>}
      <button onClick={onRefresh} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:DS.greenL,borderRadius:6,border:"none",cursor:"pointer"}}><i className="ti ti-refresh" style={{fontSize:13,color:DS.green}} aria-hidden/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:600,color:DS.green}}>Sincronizar</span></button>
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:DS.blueL,borderRadius:6}}><div style={{width:6,height:6,borderRadius:"50%",background:DS.blue}}/><span style={{fontFamily:"'Outfit',sans-serif",fontSize:10,fontWeight:600,color:DS.blue}}>Supabase Live</span></div>
    </div>
  </div>);}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function PERApp(){
  const[nav,setNav]=useState("casos");
  const[toast,setToast]=useState(null);
  const{casos,loading,error,lastUpdate,fetchCasos,actualizarEstado,actualizarNota,actualizarDatos,eliminarCaso,cerrarCaso}=useCasosSupabase();

  useEffect(()=>{
    const e1=document.querySelector("[data-per-fonts]");if(!e1){const l=document.createElement("link");l.setAttribute("data-per-fonts","1");l.href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Outfit:wght@300;400;500;600;700;800&display=swap";l.rel="stylesheet";document.head.appendChild(l);}
    const e2=document.querySelector("[data-tabler]");if(!e2){const l=document.createElement("link");l.setAttribute("data-tabler","1");l.href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css";l.rel="stylesheet";document.head.appendChild(l);}
  },[]);

  function showToast(msg,tipo="ok"){setToast({msg,tipo});setTimeout(()=>setToast(null),3500);}
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
          {loading&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,background:DS.cream}}><div style={{width:44,height:44,borderRadius:10,background:DS.ink,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${DS.goldLine}`}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:700,color:DS.gold}}>P</span></div><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL}}>Conectando con Supabase…</div></div>}
          {!loading&&error&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}><i className="ti ti-database-off" style={{fontSize:40,color:DS.red}} aria-hidden/><div style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:DS.slateL,maxWidth:320,textAlign:"center"}}>{error}</div><button onClick={fetchCasos} style={{padding:"10px 20px",borderRadius:7,border:"none",background:DS.ink,cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,color:DS.gold}}>Reintentar</button></div>}
          {!loading&&!error&&nav==="casos"    &&<PantallaCasos casos={casos} actualizarEstado={actualizarEstado} actualizarNota={actualizarNota} actualizarDatos={actualizarDatos} eliminarCaso={eliminarCaso} cerrarCaso={cerrarCaso} showToast={showToast}/>}
          {!loading&&!error&&nav==="plazos"   &&<PantallaPlazos/>}
          {!loading&&!error&&nav==="clientes" &&<PantallaClientes casos={casos}/>}
          {!loading&&!error&&nav==="metricas" &&<PantallaMetricas casos={casos}/>}
          {!loading&&!error&&nav==="sistema"  &&<PantallaSystem/>}
          {!loading&&!error&&nav==="rag"      &&<PantallaRAG/>}
          {!loading&&!error&&nav==="config"   &&<PantallaConfig showToast={showToast}/>}
        </div>
      </div>
    </div>
  );

  return(<><SignedOut>{loginScreen}</SignedOut><SignedIn>{dashboard}</SignedIn></>);
}

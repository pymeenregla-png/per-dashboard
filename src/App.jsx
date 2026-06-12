// ═══════════════════════════════════════════════════════════════════════════════
//  PER — Panel Interno v3 · Motor real Supabase + n8n + Clerk
//  Filosofía: el abogado revisa y aprueba casos cientos de veces. Ese gesto debe
//  ser tan fluido que se sienta inevitable. Velocidad (teclado), anticipación
//  (el sistema sugiere), flujo (nunca interrumpir el ritmo).
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { supabase } from "./lib/supabase";

// ─── WEBHOOKS n8n ─────────────────────────────────────────────────────────────
const WH = {
  procesar: "https://n8n.srv1108143.hstgr.cloud/webhook/per-procesar-caso",
  aprobar:  "https://n8n.srv1108143.hstgr.cloud/webhook/per-aprobar",
  escalar:  "https://n8n.srv1108143.hstgr.cloud/webhook/per-escalar",
  cerrar:   "https://n8n.srv1108143.hstgr.cloud/webhook/per-cerrar",
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
  bg:"#F6F3EE", bgCard:"#FFFFFF", bgSide:"#0C1B2E", bgInput:"#FDFBF8",
  ink:"#0C1B2E", inkM:"#1F3A5F", inkL:"#3A5578",
  slate:"#5A6B7E", slateL:"#8A9BAE", slateXL:"#C4D0DC",
  gold:"#B8943A", goldL:"#CCA84A", goldFaint:"rgba(184,148,58,0.09)",
  goldLine:"rgba(184,148,58,0.22)", goldDim:"rgba(184,148,58,0.45)",
  border:"#E8E2D8", borderM:"#D8D0C4",
  green:"#1A5E42", greenL:"rgba(26,94,66,0.11)", greenXL:"rgba(26,94,66,0.06)",
  amber:"#946010", amberL:"rgba(148,96,16,0.11)", amberXL:"rgba(148,96,16,0.06)",
  red:"#8B1E1E", redL:"rgba(139,30,30,0.10)", redXL:"rgba(139,30,30,0.06)",
  blue:"#1A3F7A", blueL:"rgba(26,63,122,0.10)",
  purple:"#3D2E8A", purpleL:"rgba(61,46,138,0.10)",
  serif:"'Cormorant Garamond', Georgia, serif",
  sans:"'Outfit', system-ui, sans-serif",
  mono:"'JetBrains Mono', 'Fira Code', monospace",
};

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const AREA_COLOR = {
  Contratos:DS.blue, Laboral:DS.amber, Marcas:DS.purple,
  Tributario:DS.green, Societario:DS.inkM, Consumidor:DS.slate,
  Cobranza:DS.red, Orientacion:DS.slate, Otro:DS.slate,
};
const AREA_ICON = {
  Contratos:"C", Laboral:"L", Marcas:"M", Tributario:"T",
  Societario:"S", Consumidor:"CO", Cobranza:"CB", Orientacion:"O", Otro:"?",
};
const ESTADO_CFG = {
  HITL:        { label:"HITL Pendiente", dot:DS.amber, bg:DS.amberL, txt:DS.amber },
  EN_REVISION: { label:"En Revisión",    dot:DS.blue,  bg:DS.blueL,  txt:DS.blue },
  ESCALADO:    { label:"Escalado",       dot:DS.red,   bg:DS.redL,   txt:DS.red },
  CERRADO:     { label:"Cerrado",        dot:DS.green, bg:DS.greenL, txt:DS.green },
  PENDIENTE:   { label:"Pendiente",      dot:DS.slate, bg:DS.border, txt:DS.slate },
  PROCESANDO:  { label:"Procesando…",   dot:DS.purple,bg:DS.purpleL,txt:DS.purple },
};
const RIESGO_CFG = {
  alto:  { color:DS.red,   bg:DS.redL },
  medio: { color:DS.amber, bg:DS.amberL },
  bajo:  { color:DS.green, bg:DS.greenL },
};
const TIPOS_DOC = [
  "Carta al cliente","Informe jurídico","Carta SII","Contrato de servicios",
  "NDA","Mandato INAPI","Contrato de trabajo","Finiquito","Minuta societaria",
];
// Catálogo base de agentes — nombres y orden fijos.
// El estado y confianza se calculan en tiempo real desde Supabase (useAgentesStatus).
const AGENTES_BASE = [
  { id:"A0", nombre:"Intake & Routing"  },
  { id:"A1", nombre:"Contratos"         },
  { id:"A2", nombre:"Marcas INAPI"      },
  { id:"A3", nombre:"Laboral DT"        },
  { id:"A4", nombre:"Tributario SII"    },
  { id:"A5", nombre:"Societario"        },
  { id:"A6", nombre:"Consumidor SERNAC" },
  { id:"A7", nombre:"Cobranza 30D"      },
];

// Calcula estado real desde métricas:
// err  → confianza < 0.45 o tasa escalación > 30%
// warn → confianza entre 0.45 y 0.65
// ok   → confianza ≥ 0.65 (o sin datos aún → ok neutro)
function calcEstadoAgente(conf, tasaEscalacion) {
  if (conf === null) return "ok"; // sin casos aún — neutro
  if (conf < 0.45 || tasaEscalacion > 0.30) return "err";
  if (conf < 0.65) return "warn";
  return "ok";
}

// Hook que lee métricas reales de agentes desde la tabla casos
function useAgentesStatus() {
  const [agentes, setAgentes] = useState(
    AGENTES_BASE.map(a => ({ ...a, estado:"ok", conf_prom:null, casos_total:0, escalados:0 }))
  );

  const fetchAgentes = useCallback(async () => {
    try {
      const hoy = new Date();
      hoy.setHours(0,0,0,0);
      const { data } = await supabase
        .from("casos")
        .select("agente_id, confianza_ia, estado, ingresado_at")
        .not("agente_id", "is", null);

      if (!data) return;

      // Agrupar por agente_id
      const mapa = {};
      data.forEach(c => {
        const id = c.agente_id;
        if (!mapa[id]) mapa[id] = { conf_sum:0, conf_count:0, escalados:0, total:0, hoy:0 };
        mapa[id].total++;
        if (c.confianza_ia != null) {
          mapa[id].conf_sum += parseFloat(c.confianza_ia);
          mapa[id].conf_count++;
        }
        if (c.estado === "ESCALADO") mapa[id].escalados++;
        if (new Date(c.ingresado_at) >= hoy) mapa[id].hoy++;
      });

      setAgentes(AGENTES_BASE.map(base => {
        const m = mapa[base.id];
        if (!m) return { ...base, estado:"ok", conf_prom:null, casos_total:0, escalados:0, casos_hoy:0 };
        const conf_prom    = m.conf_count > 0 ? m.conf_sum / m.conf_count : null;
        const tasaEscalacion = m.total > 0 ? m.escalados / m.total : 0;
        return {
          ...base,
          conf_prom:    conf_prom ? parseFloat(conf_prom.toFixed(2)) : null,
          casos_total:  m.total,
          escalados:    m.escalados,
          casos_hoy:    m.hoy,
          estado:       calcEstadoAgente(conf_prom, tasaEscalacion),
        };
      }));
    } catch (e) {
      console.error("useAgentesStatus:", e);
    }
  }, []);

  useEffect(() => {
    fetchAgentes();
    // Refrescar cada 2 minutos
    const interval = setInterval(fetchAgentes, 120000);
    return () => clearInterval(interval);
  }, [fetchAgentes]);

  return agentes;
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const m = (Date.now() - new Date(ts)) / 60000;
  if (m < 60)   return `${Math.round(m)}m`;
  if (m < 1440) return `${Math.round(m/60)}h`;
  return `${Math.round(m/1440)}d`;
}
function fmtDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("es-CL",{
    day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit",
  });
}
function horasDesde(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 3600000);
}
function slaInfo(sla, h) {
  const p = h / (sla || 48);
  if (p >= 1)   return { label:"Vencido", color:DS.red,   pct:100 };
  if (p >= 0.7) return { label:"Urgente", color:DS.amber, pct:Math.round(p*100) };
  return               { label:"En plazo", color:DS.green, pct:Math.round(p*100) };
}
function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// ─── MAPEADOR SUPABASE → MODELO INTERNO ──────────────────────────────────────
// Convierte una fila cruda de Supabase al modelo que usa el dashboard.
// Todo el v3 trabaja con este modelo normalizado.
function mapCaso(row) {
  const parseJsonb = (v) => {
    if (!v) return [];
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
    return Array.isArray(v) ? v : [];
  };
  const horas = horasDesde(row.ingresado_at || row.created_at);
  const confianza = parseFloat(row.confianza_ia) || 0;
  const acciones  = parseJsonb(row.acciones_pendientes);
  const fuentesRAG = parseJsonb(row.fuentes_rag);
  // Construir historial mínimo desde campos de Supabase
  const historial = [
    {
      ts:    row.ingresado_at || row.created_at,
      actor: "Sistema",
      tipo:  "sistema",
      msg:   `Caso ingresado vía ${row.canal || "web"}. Folio ${row.folio || row.id}.`,
    },
    ...(row.resumen_ia ? [{
      ts:    row.ultima_accion_at || row.ingresado_at,
      actor: `Agente ${row.agente_id || "IA"}`,
      tipo:  "ia",
      msg:   `Análisis completado. Confianza ${Math.round(confianza * 100)}%.`,
    }] : []),
  ];

  return {
    // Identificadores
    id:   row.folio || row.id,
    uuid: row.id,
    folio:(row.folio || "").split("-").pop() || "0000",
    // Estado operativo
    estado:    row.estado   || "PENDIENTE",
    prioridad: row.prioridad|| "MEDIA",
    agente:    row.agente_id|| "A0",
    canal:     row.canal    || "Web",
    kit:       row.kit      || "Arranque",
    area:      row.area     || "Otro",
    // Tiempos
    ingreso:            row.ingresado_at || row.created_at,
    horas_transcurridas:horas,
    sla_horas:          parseInt(row.sla_horas) || 48,
    // Cliente — modelo unificado compatible con v3
    cliente: {
      nombre:   row.contacto_nombre   || "-",
      empresa:  row.cliente_empresa   || "-",
      rut:      row.cliente_rut       || "-",
      email:    row.contacto_email    || "-",
      telefono: row.contacto_tel      || "-",
      tipo:     row.tipo_empresa      || "-",
    },
    asunto: row.asunto || "Sin asunto",
    // Análisis IA — modelo compatible con v3
    analisis: {
      resumen:           row.resumen_ia          || "",
      confianza,
      riesgo:            row.riesgo              || "medio",
      criterio_confianza:row.criterio_confianza  || "",
      acciones,
      plazos:            parseJsonb(row.plazos_detectados),
      escalar:           !!row.escalar,
      motivo_escalar:    row.motivo_escalar       || null,
      fuentes_rag:       fuentesRAG,
      prompt_version:    row.prompt_version       || "v1.x",
    },
    // Campos adicionales
    plazo_critico:    row.plazo_critico    || null,
    drive_url:        row.drive_url        || null,
    nota_abogado:     row.nota_abogado     || "",
    leccion:          row.leccion_aprendida|| "",
    modelo_usado:     row.modelo_usado     || "",
    borrador_aprobado:row.borrador_aprobado|| false,
    historial,
    _raw: row,
  };
}

// ─── HOOK SUPABASE ─────────────────────────────────────────────────────────────
function useCasosSupabase() {
  const [casos,      setCasos]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchCasos = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("casos")
        .select("*")
        .order("ingresado_at", { ascending: false })
        .limit(200);
      if (err) throw err;
      setCasos((data || []).map(mapCaso));
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCasos();
    const ch = supabase
      .channel("casos_rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"casos" }, fetchCasos)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchCasos]);

  const actualizarEstado = useCallback(async (uuid, estado) => {
    const { error: e } = await supabase
      .from("casos")
      .update({ estado, ultima_accion_at: new Date().toISOString() })
      .eq("id", uuid);
    if (!e) setCasos(p => p.map(c => c.uuid === uuid ? { ...c, estado } : c));
    return e;
  }, []);

  const actualizarNota = useCallback(async (uuid, nota) => {
    const { error: e } = await supabase
      .from("casos")
      .update({ nota_abogado: nota, ultima_accion_at: new Date().toISOString() })
      .eq("id", uuid);
    return e;
  }, []);

  const actualizarDatos = useCallback(async (uuid, form) => {
    const { error: e } = await supabase
      .from("casos")
      .update({
        contacto_nombre: form.nombre,
        contacto_email:  form.email,
        contacto_tel:    form.tel,
        cliente_rut:     form.rut,
        cliente_empresa: form.empresa,
        asunto:          form.asunto,
        ultima_accion_at: new Date().toISOString(),
      })
      .eq("id", uuid);
    if (!e) setCasos(p => p.map(c => c.uuid === uuid
      ? { ...c, asunto: form.asunto,
          cliente: { ...c.cliente, nombre: form.nombre, email: form.email,
            tel: form.tel, rut: form.rut, empresa: form.empresa } }
      : c));
    return e;
  }, []);

  const eliminarCaso = useCallback(async (uuid) => {
    const { error: e } = await supabase.from("casos").delete().eq("id", uuid);
    if (!e) setCasos(p => p.filter(c => c.uuid !== uuid));
    return e;
  }, []);

  const cerrarCaso = useCallback(async (uuid, leccion) => {
    const { error: e } = await supabase
      .from("casos")
      .update({
        estado: "CERRADO",
        leccion_aprendida:   leccion,
        cerrado_at:          new Date().toISOString(),
        retro_enviado:       false,
        ultima_accion_at:    new Date().toISOString(),
      })
      .eq("id", uuid);
    if (!e) setCasos(p => p.map(c => c.uuid === uuid ? { ...c, estado:"CERRADO", leccion } : c));
    return e;
  }, []);

  return {
    casos, loading, error, lastUpdate, fetchCasos,
    actualizarEstado, actualizarNota, actualizarDatos, eliminarCaso, cerrarCaso,
  };
}

// ─── HOOK PLAZOS SUPABASE ─────────────────────────────────────────────────────
function usePlazosSupabase() {
  const [plazos,  setPlazos]  = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPlazos = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("plazos_legales")
        .select("*")
        .order("fecha_vence", { ascending: true });
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      setPlazos((data || []).map(p => {
        const vence = new Date(p.fecha_vence); vence.setHours(0,0,0,0);
        const dias  = Math.round((vence - hoy) / 86400000);
        return {
          id:          p.id,
          caso_id:     p.caso_id || null,
          tipo:        p.tipo    || "General",
          cliente:     p.asunto?.split("—")[0]?.trim() || "Cliente",
          asunto:      p.asunto  || "Sin asunto",
          fecha:       p.fecha_vence,
          dias,
          urgencia:    dias<=3?"critica":dias<=7?"alta":dias<=15?"media":"baja",
          gestionado:  p.estado==="cumplido"||p.estado==="gestionado",
        };
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlazos();
    const ch = supabase
      .channel("plazos_rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"plazos_legales" }, fetchPlazos)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchPlazos]);

  const marcarGestionado = useCallback(async (id) => {
    await supabase.from("plazos_legales").update({ estado:"gestionado" }).eq("id", id);
    setPlazos(p => p.map(x => x.id === id ? { ...x, gestionado:true } : x));
  }, []);

  return { plazos, loading, fetchPlazos, marcarGestionado };
}

// ─── INTELIGENCIA ANTICIPATORIA ───────────────────────────────────────────────
// El sistema sugiere — el abogado decide. Nunca impone.
function accionSugerida(caso) {
  const c = caso.analisis.confianza;
  if (caso.analisis.escalar || c < 0.5)
    return { accion:"escalar", motivo:"Confianza baja o escalamiento marcado por el agente" };
  if (c >= 0.85 && caso.analisis.riesgo !== "alto")
    return { accion:"aprobar", motivo:"Alta confianza y riesgo controlado" };
  return null;
}

// ─── PRIMITIVOS UI ────────────────────────────────────────────────────────────
function Badge({ label, color, bg, size=10 }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:bg, color,
      fontSize:size, fontFamily:DS.sans, fontWeight:700, padding:"3px 9px", borderRadius:4,
      letterSpacing:"0.04em", whiteSpace:"nowrap" }}>
      <span style={{ width:4, height:4, borderRadius:"50%", background:color, flexShrink:0 }}/>
      {label}
    </span>
  );
}

function ConfBar({ val, showLabel=true }) {
  const pct = Math.round((val || 0) * 100);
  const c   = pct >= 70 ? DS.green : pct >= 50 ? DS.amber : pct > 0 ? DS.red : DS.slateXL;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      {showLabel && (
        <span style={{ fontFamily:DS.sans, fontSize:9, color:DS.slateL, width:60,
          textTransform:"uppercase", letterSpacing:"0.08em" }}>Confianza</span>
      )}
      <div style={{ flex:1, height:3, background:DS.border, borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:c, borderRadius:2, transition:"width .5s" }}/>
      </div>
      <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:700, color:c, minWidth:28 }}>
        {pct === 0 ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

function SLABar({ sla, horas, showLabel=true }) {
  const { label, color, pct } = slaInfo(sla, horas);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      {showLabel && (
        <span style={{ fontFamily:DS.sans, fontSize:9, color:DS.slateL, width:60,
          textTransform:"uppercase", letterSpacing:"0.08em" }}>SLA {sla}h</span>
      )}
      <div style={{ flex:1, height:3, background:DS.border, borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", background:color,
          borderRadius:2, transition:"width .5s" }}/>
      </div>
      <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:700, color, minWidth:52 }}>{label}</span>
    </div>
  );
}

function SectionLabel({ children, icon }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
      {icon && <span style={{ fontSize:12, color:DS.slateL }}>{icon}</span>}
      <span style={{ fontFamily:DS.sans, fontSize:9, fontWeight:700, color:DS.slateL,
        textTransform:"uppercase", letterSpacing:"0.13em" }}>{children}</span>
    </div>
  );
}

function InfoTile({ label, val, color, sub }) {
  return (
    <div style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:8, padding:"12px 14px" }}>
      <div style={{ fontFamily:DS.sans, fontSize:9, color:DS.slateL, textTransform:"uppercase",
        letterSpacing:"0.1em", marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:DS.serif, fontSize:24, fontWeight:700, color, marginBottom:4 }}>{val}</div>
      {sub && <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, lineHeight:1.45 }}>{sub}</div>}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
      minWidth:18, height:18, padding:"0 5px", background:"rgba(255,255,255,0.9)",
      border:`1px solid ${DS.borderM}`, borderBottom:`2px solid ${DS.borderM}`,
      borderRadius:4, fontFamily:DS.mono, fontSize:9, fontWeight:700, color:DS.slate }}>
      {children}
    </span>
  );
}

function Toast({ toast, clear }) {
  if (!toast) return null;
  const c = { ok:DS.green, warn:DS.amber, err:DS.red, info:DS.blue }[toast.tipo] || DS.green;
  const i = { ok:"✓", warn:"⚠", err:"✕", info:"…" }[toast.tipo] || "✓";
  return (
    <div style={{ position:"fixed", top:16, right:16, zIndex:9999, background:c, color:"#fff",
      padding:"11px 18px", borderRadius:8, fontFamily:DS.sans, fontSize:13, fontWeight:600,
      display:"flex", alignItems:"center", gap:10, boxShadow:"0 4px 24px rgba(0,0,0,.25)",
      animation:"slideIn .2s ease", maxWidth:420 }}>
      {i} {toast.msg}
      {toast.onUndo && (
        <button onClick={() => { toast.onUndo(); clear(); }}
          style={{ marginLeft:4, padding:"4px 12px", borderRadius:6,
            border:"1px solid rgba(255,255,255,0.45)", background:"rgba(255,255,255,0.12)",
            cursor:"pointer", fontFamily:DS.sans, fontSize:12, fontWeight:700, color:"#fff" }}
          onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.25)"}
          onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.12)"}>
          Deshacer
        </button>
      )}
    </div>
  );
}

function ActionBtn({ label, color, onClick, primary=false, sugerido=false, kbd=null, disabled=false }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setH(true)}
      onMouseLeave={() => setH(false)}
      disabled={disabled}
      style={{ position:"relative",
        padding: primary ? "8px 16px" : "7px 13px",
        background: disabled ? DS.border : h ? color : sugerido ? `${color}20` : primary ? `${color}14` : "transparent",
        border:`1px solid ${disabled ? DS.slateXL : h || sugerido ? color : `${color}45`}`,
        borderRadius:7, cursor: disabled ? "not-allowed" : "pointer", fontFamily:DS.sans,
        fontSize:12, fontWeight: sugerido ? 700 : 600,
        color: disabled ? DS.slateL : h ? "#fff" : color,
        transition:"all .12s", whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:6,
        boxShadow: sugerido && !h ? `0 0 0 3px ${color}15` : "none" }}>
      {sugerido && <span style={{ fontSize:9 }}>✦</span>}
      {label}
      {kbd && !h && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

function Empty({ icon, msg, sub }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%",
      flexDirection:"column", gap:10, background:DS.bg }}>
      <span style={{ fontSize:38, color:DS.slateXL }}>{icon}</span>
      <span style={{ fontFamily:DS.sans, fontSize:14, fontWeight:600, color:DS.slate }}>{msg}</span>
      {sub && <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.slateL }}>{sub}</span>}
    </div>
  );
}

// ─── ⌘K COMMAND PALETTE ──────────────────────────────────────────────────────
function CommandPalette({ open, onClose, casos, setNav, selectCaso }) {
  const [q,   setQ]   = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef      = useRef(null);

  useEffect(() => {
    if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const navItems = [
    { tipo:"nav", id:"home",     label:"Ir a Centro de Mando", icon:"⌂" },
    { tipo:"nav", id:"hitl",     label:"Ir a Cola HITL",       icon:"◎" },
    { tipo:"nav", id:"casos",    label:"Ir a Casos",           icon:"☰" },
    { tipo:"nav", id:"plazos",   label:"Ir a Agenda Legal",    icon:"◷" },
    { tipo:"nav", id:"clientes", label:"Ir a Clientes",        icon:"◈" },
    { tipo:"nav", id:"metricas", label:"Ir a Métricas",        icon:"↗" },
    { tipo:"nav", id:"sistema",  label:"Ir a Sistema IA",      icon:"⚙" },
    { tipo:"nav", id:"rag",      label:"Ir a RAG / Fuentes",   icon:"◻" },
  ];

  const results = useMemo(() => {
    const query = q.toLowerCase().trim();
    if (!query) return navItems.slice(0, 5);
    const navs = navItems.filter(n => n.label.toLowerCase().includes(query));
    const cs = casos
      .filter(c =>
        c.cliente.empresa.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query) ||
        c.asunto.toLowerCase().includes(query) ||
        c.analisis.resumen.toLowerCase().includes(query) ||
        c.cliente.nombre.toLowerCase().includes(query)
      )
      .slice(0, 5)
      .map(c => ({
        tipo:"caso", caso:c,
        label:`${c.cliente.empresa} — ${c.asunto.slice(0,50)}`,
        icon: AREA_ICON[c.area] || "?", sub: c.id,
      }));
    return [...cs, ...navs].slice(0, 9);
  }, [q, casos]);

  useEffect(() => { setIdx(0); }, [results.length]);

  function ejecutar(item) {
    if (item.tipo === "nav") setNav(item.id);
    if (item.tipo === "caso") { setNav("casos"); selectCaso(item.caso.uuid); }
    onClose();
  }
  function handleKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i+1, results.length-1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(i => Math.max(i-1, 0)); }
    if (e.key === "Enter" && results[idx]) { e.preventDefault(); ejecutar(results[idx]); }
    if (e.key === "Escape") onClose();
  }

  if (!open) return null;
  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(12,27,46,0.4)",
        backdropFilter:"blur(2px)", zIndex:9000, display:"flex",
        alignItems:"flex-start", justifyContent:"center", paddingTop:"14vh" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:DS.bgCard, borderRadius:14, width:560, maxWidth:"90vw",
          boxShadow:"0 24px 80px rgba(0,0,0,.4)", overflow:"hidden", animation:"cmdIn .15s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 18px",
          borderBottom:`1px solid ${DS.border}` }}>
          <span style={{ fontSize:15, color:DS.slateL }}>⌕</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey} placeholder="Buscar casos, clientes o navegar…"
            style={{ flex:1, border:"none", outline:"none", background:"transparent",
              fontFamily:DS.sans, fontSize:15, color:DS.ink }}/>
          <Kbd>esc</Kbd>
        </div>
        <div style={{ maxHeight:380, overflowY:"auto", padding:"6px 0" }}>
          {results.length === 0 && (
            <div style={{ padding:"24px", textAlign:"center" }}>
              <span style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL }}>Sin resultados para "{q}"</span>
            </div>
          )}
          {results.map((r, i) => (
            <div key={i} onClick={() => ejecutar(r)} onMouseEnter={() => setIdx(i)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 18px",
                cursor:"pointer", background: i===idx ? DS.goldFaint : "transparent",
                borderLeft:`2px solid ${i===idx ? DS.gold : "transparent"}` }}>
              <div style={{ width:26, height:26, borderRadius:6,
                background: r.tipo==="caso" ? (AREA_COLOR[r.caso?.area]||DS.slate) : DS.bg,
                border: r.tipo!=="caso" ? `1px solid ${DS.border}` : "none",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:800,
                  color: r.tipo==="caso" ? "#fff" : DS.slate }}>{r.icon}</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:DS.sans, fontSize:13, color:DS.ink, fontWeight:500,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.label}</div>
                {r.sub && <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>{r.sub}</div>}
              </div>
              {i===idx && <Kbd>↵</Kbd>}
            </div>
          ))}
        </div>
        <div style={{ padding:"9px 18px", borderTop:`1px solid ${DS.border}`, background:DS.bg,
          display:"flex", gap:14, alignItems:"center" }}>
          <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL,
            display:"flex", alignItems:"center", gap:5 }}>
            <Kbd>↑</Kbd><Kbd>↓</Kbd> navegar
          </span>
          <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL,
            display:"flex", alignItems:"center", gap:5 }}>
            <Kbd>↵</Kbd> abrir
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL NUEVO CASO ─────────────────────────────────────────────────────────
function ModalNuevoCaso({ onSave, onClose }) {
  const [form, setForm] = useState({
    nombre:"", empresa:"", rut_persona:"", rut_empresa:"", email:"", telefono:"",
    tipo:"SpA", area:"Laboral", urgencia:"normal", consulta:"", kit:"Arranque",
  });
  const [step,   setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const upd = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const inp = { width:"100%", padding:"9px 11px", borderRadius:7, boxSizing:"border-box",
    border:`1px solid ${DS.border}`, background:DS.bgInput,
    fontFamily:DS.sans, fontSize:13, color:DS.ink, outline:"none" };
  const lbl = { fontFamily:DS.sans, fontSize:10, fontWeight:700, color:DS.slateL,
    textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:5 };

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const puedeAvanzar = form.nombre && form.empresa && form.email;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(12,27,46,0.55)", zIndex:8888,
      display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:DS.bgCard, borderRadius:14, width:540, maxHeight:"92vh",
        overflow:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.35)", animation:"cmdIn .15s ease" }}>
        <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${DS.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontFamily:DS.serif, fontSize:20, fontWeight:700, color:DS.ink }}>Nuevo caso</div>
            <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL, marginTop:2 }}>
              Paso {step} de 2 — {step===1 ? "Datos del cliente" : "Consulta y configuración"}
            </div>
          </div>
          <button onClick={onClose} style={{ border:"none", background:"transparent",
            cursor:"pointer", fontSize:18, color:DS.slateL, padding:4 }}>✕</button>
        </div>
        {/* Barra de progreso */}
        <div style={{ padding:"12px 24px", background:DS.bg, borderBottom:`1px solid ${DS.border}`,
          display:"flex", gap:8, alignItems:"center" }}>
          {[1,2].map(s => (
            <div key={s} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:26, height:26, borderRadius:"50%",
                background: s<=step ? DS.gold : DS.border,
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:700,
                  color: s<=step ? "#fff" : DS.slateL }}>{s}</span>
              </div>
              <span style={{ fontFamily:DS.sans, fontSize:11,
                color: s<=step ? DS.ink : DS.slateL, fontWeight: s===step ? 600 : 400 }}>
                {s===1 ? "Cliente" : "Consulta"}
              </span>
              {s<2 && <div style={{ width:32, height:1, background: step>s ? DS.gold : DS.border }}/>}
            </div>
          ))}
        </div>
        <div style={{ padding:"20px 24px" }}>
          {step === 1 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>Nombre contacto *</label>
                  <input value={form.nombre} onChange={e=>upd("nombre",e.target.value)} style={inp}
                    placeholder="Carolina Pérez"
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
                <div><label style={lbl}>Empresa *</label>
                  <input value={form.empresa} onChange={e=>upd("empresa",e.target.value)} style={inp}
                    placeholder="Limpiezas CP SpA"
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>RUT empresa</label>
                  <input value={form.rut_empresa} onChange={e=>upd("rut_empresa",e.target.value)} style={inp}
                    placeholder="76.444.321-5"
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
                <div><label style={lbl}>Tipo empresa</label>
                  <select value={form.tipo} onChange={e=>upd("tipo",e.target.value)}
                    style={{ ...inp, cursor:"pointer" }}>
                    {["SpA","Ltda","EIRL","SA","SRL","Persona natural"].map(t=><option key={t}>{t}</option>)}
                  </select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>Email *</label>
                  <input type="email" value={form.email} onChange={e=>upd("email",e.target.value)} style={inp}
                    placeholder="contacto@empresa.cl"
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
                <div><label style={lbl}>Teléfono / WhatsApp</label>
                  <input value={form.telefono} onChange={e=>upd("telefono",e.target.value)} style={inp}
                    placeholder="+56 9 XXXX XXXX"
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>Área legal *</label>
                  <select value={form.area} onChange={e=>upd("area",e.target.value)}
                    style={{ ...inp, cursor:"pointer" }}>
                    {["Laboral","Contratos","Marcas","Tributario","Societario","Consumidor","Cobranza","Orientacion"]
                      .map(a=><option key={a}>{a}</option>)}
                  </select></div>
                <div><label style={lbl}>Urgencia</label>
                  <select value={form.urgencia} onChange={e=>upd("urgencia",e.target.value)}
                    style={{ ...inp, cursor:"pointer" }}>
                    <option value="normal">Normal (48 hrs)</option>
                    <option value="urgente">Urgente — hay plazo legal</option>
                  </select></div>
              </div>
              <div><label style={lbl}>Kit de servicio</label>
                <select value={form.kit} onChange={e=>upd("kit",e.target.value)}
                  style={{ ...inp, cursor:"pointer" }}>
                  {["Arranque","Compliance","Premium","Retainer"].map(k=><option key={k}>{k}</option>)}
                </select></div>
              <div><label style={lbl}>Descripción de la consulta *</label>
                <textarea value={form.consulta} onChange={e=>upd("consulta",e.target.value)}
                  placeholder="Describe la situación con detalle: qué ocurrió, con quién, desde cuándo, qué documentos existen, qué quiere resolver el cliente…"
                  style={{ ...inp, minHeight:120, resize:"vertical", lineHeight:1.6 }}
                  onFocus={e=>e.target.style.borderColor=DS.gold}
                  onBlur={e=>e.target.style.borderColor=DS.border}/></div>
            </div>
          )}
        </div>
        <div style={{ padding:"16px 24px", borderTop:`1px solid ${DS.border}`,
          display:"flex", gap:8, justifyContent:"space-between", alignItems:"center" }}>
          <button onClick={onClose} style={{ padding:"9px 18px", borderRadius:7,
            border:`1px solid ${DS.border}`, background:"transparent", cursor:"pointer",
            fontFamily:DS.sans, fontSize:13, color:DS.slate }}>Cancelar</button>
          <div style={{ display:"flex", gap:8 }}>
            {step===2 && (
              <button onClick={()=>setStep(1)} style={{ padding:"9px 18px", borderRadius:7,
                border:`1px solid ${DS.border}`, background:"transparent", cursor:"pointer",
                fontFamily:DS.sans, fontSize:13, color:DS.slate }}>← Atrás</button>
            )}
            {step===1 ? (
              <button onClick={()=>setStep(2)} disabled={!puedeAvanzar}
                style={{ padding:"9px 20px", borderRadius:7, border:"none",
                  background: puedeAvanzar ? DS.ink : DS.border,
                  cursor: puedeAvanzar ? "pointer" : "not-allowed",
                  fontFamily:DS.sans, fontSize:13, fontWeight:700, color:DS.gold }}>
                Continuar →
              </button>
            ) : (
              <button onClick={async()=>{if(!form.consulta)return;setSaving(true);await onSave(form);setSaving(false);}}
                disabled={!form.consulta||saving}
                style={{ padding:"9px 20px", borderRadius:7, border:"none",
                  background: form.consulta&&!saving ? DS.ink : DS.border,
                  cursor: form.consulta&&!saving ? "pointer" : "not-allowed",
                  fontFamily:DS.sans, fontSize:13, fontWeight:700, color:DS.gold }}>
                {saving ? "Creando…" : "Crear caso →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL EDITAR ─────────────────────────────────────────────────────────────
function ModalEditar({ caso, onSave, onClose }) {
  const [form, setForm] = useState({
    nombre:  caso.cliente.nombre,
    empresa: caso.cliente.empresa,
    rut:     caso.cliente.rut,
    email:   caso.cliente.email,
    tel:     caso.cliente.telefono,
    asunto:  caso.asunto,
  });
  const [saving, setSaving] = useState(false);
  const inp = { width:"100%", padding:"8px 10px", borderRadius:6, boxSizing:"border-box",
    border:`1px solid ${DS.border}`, background:DS.bgCard, fontFamily:DS.sans,
    fontSize:12, color:DS.ink, outline:"none" };
  const lbl = { fontFamily:DS.sans, fontSize:10, fontWeight:700, color:DS.slateL,
    textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:4 };

  useEffect(() => {
    const h = e => { if (e.key==="Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(12,27,46,0.55)", zIndex:8888,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:DS.bgCard, borderRadius:12, width:480, maxHeight:"90vh",
        overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.3)", animation:"cmdIn .15s ease" }}>
        <div style={{ padding:"20px 24px", borderBottom:`1px solid ${DS.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:DS.serif, fontSize:18, fontWeight:700, color:DS.ink }}>Editar datos del caso</span>
          <button onClick={onClose} style={{ border:"none", background:"transparent",
            cursor:"pointer", fontSize:20, color:DS.slateL }}>×</button>
        </div>
        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
          {[["nombre","Nombre contacto"],["empresa","Empresa"],["rut","RUT"],
            ["email","Email"],["tel","Teléfono"],["asunto","Asunto"]].map(([k,l]) => (
            <div key={k}>
              <label style={lbl}>{l}</label>
              <input value={form[k]||""} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp}
                onFocus={e=>e.target.style.borderColor=DS.gold}
                onBlur={e=>e.target.style.borderColor=DS.border}/>
            </div>
          ))}
        </div>
        <div style={{ padding:"16px 24px", borderTop:`1px solid ${DS.border}`,
          display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"9px 18px", borderRadius:7,
            border:`1px solid ${DS.border}`, background:"transparent", cursor:"pointer",
            fontFamily:DS.sans, fontSize:13, color:DS.slate }}>Cancelar</button>
          <button onClick={async()=>{setSaving(true);await onSave(form);setSaving(false);}}
            disabled={saving}
            style={{ padding:"9px 18px", borderRadius:7, border:"none", background:DS.ink,
              cursor:"pointer", fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.gold }}>
            {saving ? "Guardando…" : "Guardar en Supabase"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ELIMINAR ───────────────────────────────────────────────────────────
function ModalEliminar({ caso, onConfirm, onClose }) {
  const [confirm, setConfirm] = useState("");
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    const h = e => { if (e.key==="Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(12,27,46,0.55)", zIndex:8888,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:DS.bgCard, borderRadius:12, width:420,
        boxShadow:"0 20px 60px rgba(0,0,0,.35)", animation:"cmdIn .15s ease" }}>
        <div style={{ padding:"20px 24px", borderBottom:`1px solid ${DS.border}` }}>
          <div style={{ fontFamily:DS.serif, fontSize:18, fontWeight:700, color:DS.red }}>Eliminar caso</div>
        </div>
        <div style={{ padding:"20px 24px" }}>
          <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slate, margin:"0 0 16px", lineHeight:1.6 }}>
            Esta acción es <strong>irreversible</strong>. El caso <strong>{caso.id}</strong> de{" "}
            <strong>{caso.cliente.empresa}</strong> será eliminado permanentemente de Supabase.
          </p>
          <label style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL,
            display:"block", marginBottom:6 }}>Escribe el folio para confirmar:</label>
          <input value={confirm} onChange={e=>setConfirm(e.target.value)}
            placeholder={caso.id}
            style={{ width:"100%", padding:"8px 11px", borderRadius:7, boxSizing:"border-box",
              border:`1px solid ${DS.border}`, fontFamily:DS.mono, fontSize:12, outline:"none" }}/>
        </div>
        <div style={{ padding:"16px 24px", borderTop:`1px solid ${DS.border}`,
          display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"9px 18px", borderRadius:7,
            border:`1px solid ${DS.border}`, background:"transparent", cursor:"pointer",
            fontFamily:DS.sans, fontSize:13, color:DS.slate }}>Cancelar</button>
          <button
            onClick={async()=>{if(confirm!==caso.id)return;setSaving(true);await onConfirm();setSaving(false);}}
            disabled={confirm!==caso.id||saving}
            style={{ padding:"9px 18px", borderRadius:7, border:"none",
              background: confirm===caso.id ? DS.red : DS.border,
              cursor: confirm===caso.id ? "pointer" : "not-allowed",
              fontFamily:DS.sans, fontSize:13, fontWeight:700, color:"#fff" }}>
            {saving ? "Eliminando…" : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ nav, setNav, hitlCount, plazosCount, agentesErr, collapsed, setCollapsed, onCmd, lastUpdate }) {
  const items = [
    { id:"home",     icon:"⌂",  label:"Centro de Mando",  kbd:"1" },
    { id:"hitl",     icon:"◎",  label:"Cola HITL",        kbd:"2", badge:hitlCount,   badgeColor:DS.amber },
    { id:"casos",    icon:"☰",  label:"Casos",            kbd:"3" },
    { id:"plazos",   icon:"◷",  label:"Agenda Legal",     kbd:"4", badge:plazosCount, badgeColor:DS.red },
    { id:"clientes", icon:"◈",  label:"Clientes",         kbd:"5" },
    { id:"metricas", icon:"↗",  label:"Métricas",         kbd:"6" },
    { id:"sistema",  icon:"⚙",  label:"Sistema IA",       kbd:"7", dot: agentesErr>0 ? DS.red : null },
    { id:"rag",      icon:"◻",  label:"RAG / Fuentes",    kbd:"8" },
    { id:"config",   icon:"◧",  label:"Configuración" },
  ];

  return (
    <div style={{ width: collapsed ? 56 : 224, background:DS.bgSide, display:"flex",
      flexDirection:"column", flexShrink:0, height:"100vh",
      transition:"width .2s ease", overflow:"hidden" }}>
      {/* Logo */}
      <div style={{ padding: collapsed?"20px 10px 16px":"20px 18px 16px",
        borderBottom:"1px solid rgba(255,255,255,0.07)",
        display:"flex", alignItems:"center", justifyContent: collapsed ? "center" : "space-between" }}>
        {!collapsed ? (
          <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
            <div style={{ width:32, height:32, border:`1.5px solid ${DS.goldDim}`, borderRadius:6,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <span style={{ fontFamily:DS.serif, fontSize:16, fontWeight:700, color:DS.gold }}>P</span>
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontFamily:DS.serif, fontSize:14, fontWeight:700, color:"#FDFBF8",
                lineHeight:1.1, whiteSpace:"nowrap" }}>Pyme En Regla</div>
              <div style={{ fontFamily:DS.sans, fontSize:8, color:"rgba(255,255,255,0.3)",
                letterSpacing:"0.14em", textTransform:"uppercase", marginTop:2 }}>Panel interno</div>
            </div>
          </div>
        ) : (
          <div style={{ width:32, height:32, border:`1.5px solid ${DS.goldDim}`, borderRadius:6,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontFamily:DS.serif, fontSize:16, fontWeight:700, color:DS.gold }}>P</span>
          </div>
        )}
        {!collapsed && (
          <button onClick={()=>setCollapsed(true)}
            style={{ border:"none", background:"rgba(255,255,255,0.06)", cursor:"pointer",
              borderRadius:5, padding:"4px 6px", color:"rgba(255,255,255,0.4)", fontSize:12, flexShrink:0 }}>‹</button>
        )}
      </div>
      {collapsed && (
        <button onClick={()=>setCollapsed(false)}
          style={{ margin:"8px auto 0", border:"none", background:"rgba(255,255,255,0.06)",
            cursor:"pointer", borderRadius:5, padding:"4px 8px",
            color:"rgba(255,255,255,0.4)", fontSize:12 }}>›</button>
      )}
      {/* ⌘K */}
      {!collapsed && (
        <button onClick={onCmd}
          style={{ margin:"12px 16px 4px", display:"flex", alignItems:"center", gap:8,
            padding:"8px 12px", background:"rgba(255,255,255,0.05)",
            border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, cursor:"pointer",
            transition:"background .12s" }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.09)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}>
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>⌕</span>
          <span style={{ fontFamily:DS.sans, fontSize:11, color:"rgba(255,255,255,0.4)",
            flex:1, textAlign:"left" }}>Buscar…</span>
          <span style={{ fontFamily:DS.mono, fontSize:9, color:"rgba(255,255,255,0.3)",
            background:"rgba(255,255,255,0.07)", padding:"2px 5px", borderRadius:3 }}>⌘K</span>
        </button>
      )}
      {/* Nav items */}
      <div style={{ flex:1, paddingTop:6, overflowY:"auto" }}>
        {items.map(it => {
          const active = nav === it.id;
          return (
            <button key={it.id} onClick={()=>setNav(it.id)} title={collapsed ? it.label : undefined}
              style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
                padding: collapsed ? "11px 0" : "10px 18px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: active ? "rgba(184,148,58,0.13)" : "transparent",
                border:"none", borderLeft:`2px solid ${active ? DS.gold : "transparent"}`,
                cursor:"pointer", transition:"all .12s", position:"relative" }}
              onMouseEnter={e=>{ if(!active) e.currentTarget.style.background="rgba(255,255,255,0.05)"; }}
              onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="transparent"; }}>
              <span style={{ fontSize:15, color: active ? DS.gold : "rgba(255,255,255,0.4)", flexShrink:0 }}>{it.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ fontFamily:DS.sans, fontSize:13, fontWeight: active ? 600 : 400,
                    color: active ? DS.gold : "rgba(255,255,255,0.6)", flex:1, textAlign:"left" }}>{it.label}</span>
                  {it.badge > 0 && (
                    <span style={{ background:it.badgeColor||DS.red, color:"#fff",
                      fontFamily:DS.sans, fontSize:9, fontWeight:800,
                      padding:"2px 6px", borderRadius:10, minWidth:18, textAlign:"center" }}>{it.badge}</span>
                  )}
                  {it.dot && <div style={{ width:7, height:7, borderRadius:"50%", background:it.dot, flexShrink:0 }}/>}
                </>
              )}
              {collapsed && it.badge > 0 && (
                <div style={{ position:"absolute", top:6, right:8, width:8, height:8,
                  borderRadius:"50%", background:it.badgeColor||DS.red }}/>
              )}
            </button>
          );
        })}
      </div>
      {/* Realtime status */}
      {!collapsed && (
        <div style={{ padding:"10px 18px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:DS.green,
              boxShadow:`0 0 6px ${DS.green}`, flexShrink:0 }}/>
            <span style={{ fontFamily:DS.sans, fontSize:10, color:"rgba(255,255,255,0.3)" }}>
              Supabase Live
              {lastUpdate && ` · ${lastUpdate.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}`}
            </span>
          </div>
        </div>
      )}
      {/* Usuario */}
      <div style={{ padding: collapsed ? "12px 0" : "12px 18px",
        borderTop:"1px solid rgba(255,255,255,0.06)",
        display:"flex", alignItems:"center", gap:10, justifyContent: collapsed ? "center" : "flex-start" }}>
        <div style={{ width:30, height:30, borderRadius:"50%", background:"rgba(184,148,58,0.15)",
          border:`1px solid ${DS.goldDim}`, display:"flex", alignItems:"center",
          justifyContent:"center", flexShrink:0 }}>
          <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:800, color:DS.gold }}>KL</span>
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontFamily:DS.sans, fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.75)" }}>Kurt Leupin</div>
            <div style={{ fontFamily:DS.sans, fontSize:9, color:"rgba(255,255,255,0.3)" }}>Abogado · Admin</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TOPBAR ───────────────────────────────────────────────────────────────────
function TopBar({ nav, casos, onNuevoCaso, sesion, onRefresh }) {
  const titles = {
    home:"Centro de Mando", hitl:"Cola HITL — Revisión pendiente",
    casos:"Gestión de Casos", plazos:"Agenda Legal", clientes:"Clientes",
    metricas:"Métricas del sistema", sistema:"Sistema IA",
    rag:"RAG / Fuentes", config:"Configuración",
  };
  const activos    = casos.filter(c=>c.estado!=="CERRADO").length;
  const hitl       = casos.filter(c=>c.estado==="HITL").length;
  const slaVencidos= casos.filter(c=>c.estado!=="CERRADO"&&slaInfo(c.sla_horas,c.horas_transcurridas).label==="Vencido").length;
  const revisadosHoy = sesion.aprobados + sesion.escalados + sesion.rechazados;

  return (
    <div style={{ height:52, background:DS.bgCard, borderBottom:`1px solid ${DS.border}`,
      display:"flex", alignItems:"center", padding:"0 24px",
      justifyContent:"space-between", flexShrink:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <span style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.slate }}>
          {titles[nav] || "Panel PER"}
        </span>
        {revisadosHoy > 0 && (
          <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL,
            background:DS.bg, padding:"4px 10px", borderRadius:12 }}>
            Hoy: {revisadosHoy} revisado{revisadosHoy!==1?"s":""}
          </span>
        )}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:20 }}>
        {[
          { label:"Activos",  val:activos,     color:DS.blue },
          { label:"HITL",     val:hitl,        color:DS.amber },
          { label:"SLA venc", val:slaVencidos, color:slaVencidos>0?DS.red:DS.slateXL },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ textAlign:"center" }}>
            <div style={{ fontFamily:DS.serif, fontSize:18, fontWeight:700, color, lineHeight:1 }}>{val}</div>
            <div style={{ fontFamily:DS.sans, fontSize:8, color:DS.slateL,
              letterSpacing:"0.1em", textTransform:"uppercase" }}>{label}</div>
          </div>
        ))}
        {onRefresh && (
          <button onClick={onRefresh}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px",
              background:DS.greenL, borderRadius:6, border:"none", cursor:"pointer" }}>
            <span style={{ fontSize:12, color:DS.green }}>↻</span>
            <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:600, color:DS.green }}>Sincronizar</span>
          </button>
        )}
        <button onClick={onNuevoCaso}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7,
            border:`1px solid ${DS.goldLine}`, background:DS.goldFaint, cursor:"pointer",
            fontFamily:DS.sans, fontSize:12, fontWeight:700, color:DS.gold, transition:"all .12s" }}
          onMouseEnter={e=>{ e.currentTarget.style.background=DS.gold; e.currentTarget.style.color="#fff"; }}
          onMouseLeave={e=>{ e.currentTarget.style.background=DS.goldFaint; e.currentTarget.style.color=DS.gold; }}>
          + Nuevo caso <Kbd>N</Kbd>
        </button>
      </div>
    </div>
  );
}

// ─── CASO ROW ─────────────────────────────────────────────────────────────────
function CasoRow({ caso, selected, onClick, saliendo }) {
  const est    = ESTADO_CFG[caso.estado] || ESTADO_CFG.PENDIENTE;
  const ac     = AREA_COLOR[caso.area]   || DS.slate;
  const urgent = caso.estado==="ESCALADO" || caso.estado==="HITL";
  const sug    = accionSugerida(caso);

  return (
    <div onClick={onClick}
      style={{ padding:"13px 16px", borderBottom:`1px solid ${DS.border}`, cursor:"pointer",
        background: selected ? DS.goldFaint : urgent ? DS.amberXL : DS.bgCard,
        borderLeft:`3px solid ${selected ? DS.gold : urgent ? DS.amber : "transparent"}`,
        transition:"all .25s ease",
        opacity: saliendo ? 0 : 1,
        transform: saliendo ? "translateX(30px)" : "translateX(0)",
        maxHeight: saliendo ? 0 : 300, overflow: saliendo ? "hidden" : "visible" }}
      onMouseEnter={e=>{ if(!selected&&!saliendo) e.currentTarget.style.background=DS.bg; }}
      onMouseLeave={e=>{ if(!selected&&!saliendo) e.currentTarget.style.background=urgent?DS.amberXL:DS.bgCard; }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <div style={{ width:22, height:22, borderRadius:5, background:ac,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <span style={{ fontFamily:DS.sans, fontSize:9, fontWeight:800, color:"#fff" }}>
              {AREA_ICON[caso.area]||"?"}
            </span>
          </div>
          <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:700, color:DS.gold }}>{caso.id}</span>
          <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>{caso.area}</span>
        </div>
        <Badge label={est.label} color={est.dot} bg={est.bg} />
      </div>
      <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink,
        marginBottom:2, lineHeight:1.2 }}>{caso.cliente.empresa}</div>
      <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slate, marginBottom:8, lineHeight:1.4 }}>
        {(caso.asunto||"").length>58 ? (caso.asunto||"").slice(0,58)+"…" : caso.asunto||"-"}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        <ConfBar val={caso.analisis.confianza} showLabel={false}/>
        <SLABar sla={caso.sla_horas} horas={caso.horas_transcurridas} showLabel={false}/>
      </div>
      <div style={{ display:"flex", gap:6, marginTop:7, flexWrap:"wrap" }}>
        {caso.plazo_critico && (
          <div style={{ display:"flex", alignItems:"center", gap:5, background:DS.redL,
            padding:"3px 8px", borderRadius:4 }}>
            <span style={{ fontFamily:DS.sans, fontSize:9, color:DS.red, fontWeight:700 }}>
              ⚑ {new Date(caso.plazo_critico).toLocaleDateString("es-CL")}
            </span>
          </div>
        )}
        {sug && (
          <div style={{ display:"flex", alignItems:"center", gap:4,
            background: sug.accion==="aprobar" ? DS.greenXL : DS.redXL,
            padding:"3px 8px", borderRadius:4 }}>
            <span style={{ fontFamily:DS.sans, fontSize:9, fontWeight:700,
              color: sug.accion==="aprobar" ? DS.green : DS.red }}>
              ✦ {sug.accion==="aprobar" ? "aprobar" : "escalar"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CASO DETAIL ──────────────────────────────────────────────────────────────
function CasoDetail({ caso, onAccion, onEditar, onEliminar, flowInfo, focus, setFocus }) {
  const [tab,      setTab]      = useState("analisis");
  const [nota,     setNota]     = useState(caso.nota_abogado||"");
  const [leccion,  setLeccion]  = useState(caso.leccion||"");
  const [tipoDoc,  setTipoDoc]  = useState(TIPOS_DOC[0]);
  const [procesando,  setProc]  = useState(false);
  const [guardandoNota, setGN]  = useState(false);

  useEffect(() => {
    setTab("analisis");
    setNota(caso.nota_abogado||"");
    setLeccion(caso.leccion||"");
  }, [caso.uuid]);

  const est     = ESTADO_CFG[caso.estado] || ESTADO_CFG.PENDIENTE;
  const ac      = AREA_COLOR[caso.area]   || DS.slate;
  const cerrado = caso.estado === "CERRADO";
  const tieneAnalisis = caso.analisis.resumen && caso.analisis.resumen.length > 10;
  const rCfg    = RIESGO_CFG[caso.analisis.riesgo] || RIESGO_CFG.medio;
  const sug     = !cerrado ? accionSugerida(caso) : null;

  const TABS = [
    { id:"analisis", label:"Análisis IA" },
    { id:"consulta", label:"Consulta" },
    { id:"historial",label:"Historial" },
    { id:"generar",  label:"Generar doc", hidden:cerrado },
    { id:"cierre",   label:"Cierre",      hidden:cerrado },
  ].filter(t => !t.hidden);

  async function handleProcesar() {
    setProc(true);
    await onAccion(caso.uuid, "procesar", null);
    setProc(false);
  }
  async function handleGuardarNota() {
    setGN(true);
    await onAccion(caso.uuid, "guardarNota", nota);
    setGN(false);
  }
  function handleAccion(tipo) {
    onAccion(caso.uuid, tipo, { nota, leccion });
  }
  async function handleGenerar() {
    setProc(true);
    await onAccion(caso.uuid, "generar_doc", { tipo:tipoDoc });
    setProc(false);
  }

  // Atajos de teclado a nivel caso
  useEffect(() => {
    function onKey(e) {
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k==="f" && setFocus) { e.preventDefault(); setFocus(f=>!f); return; }
      if (cerrado) return;
      if (k==="a") { e.preventDefault(); handleAccion("aprobar"); }
      if (k==="e") { e.preventDefault(); handleAccion("escalar"); }
      if (k==="r") { e.preventDefault(); handleAccion("rechazar"); }
      if (k==="i") { e.preventDefault(); handleAccion("info"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [caso.uuid, nota, leccion, cerrado]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:DS.bgCard }}>
      {/* Header */}
      <div style={{ background:DS.bg, borderBottom:`1px solid ${DS.border}`, flexShrink:0 }}>
        <div style={{ padding:"16px 24px 0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
            marginBottom:10, gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", flex:1 }}>
              <div style={{ background:DS.ink, borderRadius:5, padding:"4px 10px",
                border:`1px solid ${DS.goldLine}` }}>
                <span style={{ fontFamily:DS.mono, fontSize:11, fontWeight:700, color:DS.gold }}>{caso.id}</span>
              </div>
              <Badge label={est.label} color={est.dot} bg={est.bg}/>
              {caso.analisis.escalar && <Badge label="⚑ Escalar" color={DS.red} bg={DS.redL}/>}
              <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700,
                color: caso.prioridad==="CRITICA"?DS.red:caso.prioridad==="ALTA"?DS.amber:DS.blue }}>
                ● {caso.prioridad}
              </span>
              {caso.modelo_usado && (
                <Badge label={caso.modelo_usado} color={DS.purple} bg={DS.purpleL} size={9}/>
              )}
              {flowInfo && (
                <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL,
                  background:DS.bgCard, padding:"3px 9px", borderRadius:10,
                  border:`1px solid ${DS.border}` }}>{flowInfo}</span>
              )}
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
              {!cerrado ? (
                <>
                  <ActionBtn label="Aprobar" color={DS.green} onClick={()=>handleAccion("aprobar")}
                    primary sugerido={sug?.accion==="aprobar"} kbd="A"
                    disabled={!tieneAnalisis}/>
                  <ActionBtn label="Info" color={DS.blue} onClick={()=>handleAccion("info")} kbd="I"/>
                  <ActionBtn label="Escalar" color={DS.amber} onClick={()=>handleAccion("escalar")}
                    sugerido={sug?.accion==="escalar"} kbd="E"/>
                  <ActionBtn label="Rechazar" color={DS.red} onClick={()=>handleAccion("rechazar")} kbd="R"/>
                  <button onClick={()=>onEditar(caso)} title="Editar"
                    style={{ padding:"7px 9px", borderRadius:7, border:`1px solid ${DS.border}`,
                      background:"transparent", cursor:"pointer", color:DS.slateL, fontSize:13,
                      transition:"all .12s" }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=DS.gold; e.currentTarget.style.color=DS.gold; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=DS.border; e.currentTarget.style.color=DS.slateL; }}>✎</button>
                  {setFocus && (
                    <button onClick={()=>setFocus(f=>!f)} title={focus?"Salir de modo enfoque (F)":"Modo enfoque (F)"}
                      style={{ padding:"7px 9px", borderRadius:7,
                        border:`1px solid ${focus?DS.gold:DS.border}`,
                        background:focus?DS.goldFaint:"transparent", cursor:"pointer",
                        color:focus?DS.gold:DS.slateL, fontSize:13, transition:"all .12s" }}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor=DS.gold; e.currentTarget.style.color=DS.gold; }}
                      onMouseLeave={e=>{ if(!focus){e.currentTarget.style.borderColor=DS.border;e.currentTarget.style.color=DS.slateL;} }}>⛶</button>
                  )}
                  <button onClick={()=>onEliminar(caso)} title="Eliminar"
                    style={{ padding:"7px 9px", borderRadius:7, border:`1px solid ${DS.border}`,
                      background:"transparent", cursor:"pointer", color:DS.slateL, fontSize:13,
                      transition:"all .12s" }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=DS.red; e.currentTarget.style.color=DS.red; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=DS.border; e.currentTarget.style.color=DS.slateL; }}>🗑</button>
                </>
              ) : (
                <Badge label="Caso cerrado ✓" color={DS.green} bg={DS.greenL}/>
              )}
            </div>
          </div>

          {/* Sugerencia inteligente */}
          {sug && (
            <div style={{ marginBottom:10, display:"flex", alignItems:"center", gap:8,
              background: sug.accion==="aprobar" ? DS.greenXL : DS.redXL,
              border:`1px solid ${sug.accion==="aprobar"?DS.green:DS.red}20`,
              borderRadius:7, padding:"7px 12px" }}>
              <span style={{ fontSize:11, color: sug.accion==="aprobar"?DS.green:DS.red }}>✦</span>
              <span style={{ fontFamily:DS.sans, fontSize:11,
                color: sug.accion==="aprobar" ? DS.green : DS.red }}>
                <strong>Sugerencia del sistema:</strong> {sug.accion==="aprobar"?"aprobar":"escalar"} — {sug.motivo}.{" "}
                La decisión final es tuya.
              </span>
            </div>
          )}

          {/* Procesar con IA si no tiene análisis */}
          {!tieneAnalisis && !cerrado && (
            <div style={{ marginBottom:10, background:DS.goldFaint, border:`1px solid ${DS.goldLine}`,
              borderRadius:8, padding:"12px 14px", display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:18, color:DS.gold }}>⚡</span>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:DS.sans, fontSize:12, fontWeight:700, color:DS.ink }}>Sin análisis del agente</div>
                <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>
                  Procesa el caso para habilitar "Aprobar"
                </div>
              </div>
              <button onClick={handleProcesar} disabled={procesando}
                style={{ padding:"8px 16px", borderRadius:7, border:"none",
                  background: procesando ? DS.border : DS.ink, cursor: procesando?"not-allowed":"pointer",
                  fontFamily:DS.sans, fontSize:12, fontWeight:700, color:DS.gold }}>
                {procesando ? "Enviando…" : "Procesar con IA →"}
              </button>
            </div>
          )}

          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <div style={{ width:26, height:26, borderRadius:5, background:ac,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:800, color:"#fff" }}>
                {AREA_ICON[caso.area]||"?"}
              </span>
            </div>
            <span style={{ fontFamily:DS.serif, fontSize:19, fontWeight:700, color:DS.ink }}>
              {caso.cliente.empresa}
            </span>
          </div>

          <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, marginBottom:10,
            display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span>{caso.cliente.rut}</span><span>·</span>
            <span>{caso.area} — {caso.agente}</span><span>·</span>
            <span>{caso.canal}</span><span>·</span>
            <span>{fmtDate(caso.ingreso)}</span>
            {caso.drive_url ? (
              <a href={caso.drive_url} target="_blank" rel="noreferrer"
                style={{ color:DS.gold, textDecoration:"none", fontWeight:700 }}>📁 Expediente Drive</a>
            ) : !cerrado && (
              <span style={{ color:DS.slateL, fontStyle:"italic" }}>📁 Drive pendiente</span>
            )}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:10 }}>
            <ConfBar val={caso.analisis.confianza}/>
            <SLABar sla={caso.sla_horas} horas={caso.horas_transcurridas}/>
          </div>

          {caso.plazo_critico && (
            <div style={{ marginBottom:10, display:"flex", alignItems:"center", gap:8,
              background:DS.redL, border:`1px solid ${DS.red}20`, borderRadius:7, padding:"8px 12px" }}>
              <span style={{ fontSize:15 }}>⏰</span>
              <span style={{ fontFamily:DS.sans, fontSize:12, fontWeight:700, color:DS.red }}>
                Plazo crítico: {new Date(caso.plazo_critico).toLocaleDateString("es-CL",{
                  weekday:"long", day:"numeric", month:"long" })}
              </span>
            </div>
          )}

          <div style={{ display:"flex", gap:0, marginBottom:-1 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ padding:"8px 14px", background:"transparent", border:"none",
                  borderBottom:`2px solid ${tab===t.id ? DS.gold : "transparent"}`,
                  cursor:"pointer", transition:"all .1s" }}>
                <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:tab===t.id?700:400,
                  color:tab===t.id?DS.gold:DS.slateL }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex:1, overflowY:"auto", padding:"18px 24px" }}>

        {/* TAB: ANÁLISIS IA */}
        {tab==="analisis" && (
          <div key={caso.uuid} style={{ animation:"fadeUp .25s ease" }}>
            {tieneAnalisis ? (
              <>
                <div style={{ marginBottom:18 }}>
                  <SectionLabel icon="◎">Resumen del agente</SectionLabel>
                  <div style={{ background:DS.goldFaint, border:`1px solid ${DS.goldLine}`,
                    borderRadius:8, padding:"13px 16px" }}>
                    <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.inkM, margin:0, lineHeight:1.7 }}>
                      {caso.analisis.resumen}
                    </p>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
                  <InfoTile label="Confianza del análisis"
                    val={`${Math.round(caso.analisis.confianza*100)}%`}
                    color={caso.analisis.confianza>=0.7?DS.green:caso.analisis.confianza>=0.5?DS.amber:DS.red}
                    sub={caso.analisis.criterio_confianza}/>
                  <InfoTile label="Nivel de riesgo"
                    val={(caso.analisis.riesgo||"medio").charAt(0).toUpperCase()+(caso.analisis.riesgo||"medio").slice(1)}
                    color={rCfg.color}
                    sub={caso.analisis.escalar ? `⚑ ${caso.analisis.motivo_escalar}` : "Sin escalamiento requerido"}/>
                </div>
                {caso.analisis.acciones.length > 0 && (
                  <div style={{ marginBottom:18 }}>
                    <SectionLabel icon="✓">Acciones recomendadas</SectionLabel>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {caso.analisis.acciones.map((a,i) => (
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                          padding:"9px 12px", background:DS.bg, borderRadius:7,
                          borderLeft:`3px solid ${DS.border}` }}>
                          <div style={{ width:18, height:18, borderRadius:4,
                            border:`1.5px solid ${DS.slateXL}`, display:"flex", alignItems:"center",
                            justifyContent:"center", flexShrink:0, marginTop:1 }}>
                            <span style={{ fontFamily:DS.sans, fontSize:8, color:DS.slateL, fontWeight:700 }}>{i+1}</span>
                          </div>
                          <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, lineHeight:1.5, flex:1 }}>
                            {typeof a==="string" ? a : JSON.stringify(a)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {caso.analisis.plazos.length > 0 && (
                  <div style={{ marginBottom:18 }}>
                    <SectionLabel icon="◷">Plazos detectados por el agente</SectionLabel>
                    {caso.analisis.plazos.map((p,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
                        padding:"10px 14px",
                        background: p.urgencia==="critica" ? DS.redL : DS.amberL,
                        borderRadius:7, marginBottom:5 }}>
                        <div style={{ width:40, height:40, borderRadius:7, background:"rgba(255,255,255,0.5)",
                          display:"flex", flexDirection:"column", alignItems:"center",
                          justifyContent:"center", flexShrink:0 }}>
                          <span style={{ fontFamily:DS.serif, fontSize:18, fontWeight:700,
                            color: p.urgencia==="critica" ? DS.red : DS.amber, lineHeight:1 }}>{p.dias}</span>
                          <span style={{ fontFamily:DS.sans, fontSize:7,
                            color: p.urgencia==="critica" ? DS.red : DS.amber, fontWeight:600 }}>días</span>
                        </div>
                        <span style={{ fontFamily:DS.sans, fontSize:12, fontWeight:600, color:DS.ink }}>
                          {p.descripcion}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {caso.analisis.fuentes_rag.length > 0 && (
                  <div style={{ marginBottom:18 }}>
                    <SectionLabel icon="◈">Fuentes RAG consultadas</SectionLabel>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {caso.analisis.fuentes_rag.map((f,i) => {
                        const nombre = typeof f==="string" ? f : (f.nombre||JSON.stringify(f));
                        const rel    = typeof f==="object" ? (f.relevancia||0) : 0;
                        return (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:10,
                            padding:"8px 12px", background:DS.bg, borderRadius:7 }}>
                            <span style={{ fontFamily:DS.mono, fontSize:9, color:DS.gold,
                              fontWeight:700, flexShrink:0 }}>{typeof f==="object"?f.id||"—":"—"}</span>
                            <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, flex:1 }}>{nombre}</span>
                            {rel > 0 && (
                              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                                <div style={{ width:40, height:3, background:DS.border, borderRadius:2 }}>
                                  <div style={{ width:`${rel*100}%`, height:"100%",
                                    background: rel>=0.9?DS.green:DS.amber, borderRadius:2 }}/>
                                </div>
                                <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700,
                                  color: rel>=0.9?DS.green:DS.amber }}>{Math.round(rel*100)}%</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:10,
                padding:"32px 24px", textAlign:"center" }}>
                <div style={{ fontFamily:DS.serif, fontSize:20, color:DS.slateL, marginBottom:8 }}>Sin análisis IA</div>
                <div style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, marginBottom:20 }}>
                  El agente aún no ha procesado este caso.
                </div>
                <button onClick={handleProcesar} disabled={procesando}
                  style={{ padding:"10px 24px", borderRadius:8, border:"none",
                    background: procesando?DS.border:DS.ink, cursor: procesando?"not-allowed":"pointer",
                    fontFamily:DS.sans, fontSize:13, fontWeight:700, color:DS.gold }}>
                  {procesando ? "Enviando al agente…" : "Procesar con agente IA →"}
                </button>
              </div>
            )}

            {/* Nota del abogado */}
            {!cerrado && (
              <div style={{ marginTop:18 }}>
                <SectionLabel icon="✎">Nota interna del abogado</SectionLabel>
                <textarea value={nota} onChange={e=>setNota(e.target.value)}
                  placeholder="Observaciones, correcciones al análisis, instrucciones internas…"
                  style={{ width:"100%", minHeight:80, background:DS.bg, border:`1px solid ${DS.border}`,
                    borderRadius:8, boxSizing:"border-box", padding:"10px 13px",
                    fontFamily:DS.sans, fontSize:13, color:DS.ink, resize:"vertical",
                    outline:"none", lineHeight:1.5, marginBottom:8 }}
                  onFocus={e=>e.target.style.borderColor=DS.gold}
                  onBlur={e=>e.target.style.borderColor=DS.border}/>
                <div style={{ display:"flex", justifyContent:"flex-end" }}>
                  <button onClick={handleGuardarNota} disabled={guardandoNota}
                    style={{ padding:"7px 16px", borderRadius:6, border:`1px solid ${DS.border}`,
                      background:DS.bgCard, cursor:"pointer", fontFamily:DS.sans,
                      fontSize:11, fontWeight:600, color:DS.slate }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=DS.gold; e.currentTarget.style.color=DS.gold; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=DS.border; e.currentTarget.style.color=DS.slate; }}>
                    {guardandoNota ? "Guardando…" : "Guardar nota en Supabase"}
                  </button>
                </div>
              </div>
            )}
            {cerrado && caso.nota_abogado && (
              <div style={{ marginTop:18 }}>
                <SectionLabel icon="✎">Nota del abogado</SectionLabel>
                <div style={{ background:DS.blueL, borderRadius:8, padding:"12px 14px" }}>
                  <p style={{ fontFamily:DS.sans, fontSize:12, color:DS.blue, margin:0, lineHeight:1.6 }}>
                    {caso.nota_abogado}
                  </p>
                </div>
              </div>
            )}
            {cerrado && caso.leccion && (
              <div style={{ marginTop:18 }}>
                <SectionLabel icon="◈">Lección registrada en RAG</SectionLabel>
                <div style={{ background:DS.greenXL, border:`1px solid ${DS.green}20`, borderRadius:8, padding:"12px 14px" }}>
                  <p style={{ fontFamily:DS.sans, fontSize:12, color:DS.green, margin:0, lineHeight:1.6 }}>
                    {caso.leccion}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: CONSULTA */}
        {tab==="consulta" && (
          <div style={{ animation:"fadeUp .25s ease" }}>
            <SectionLabel icon="◈">Datos del cliente</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:18 }}>
              {[
                ["Empresa",  caso.cliente.empresa],
                ["RUT",      caso.cliente.rut],
                ["Nombre",   caso.cliente.nombre],
                ["Email",    caso.cliente.email],
                ["Teléfono", caso.cliente.telefono],
                ["Canal",    caso.canal],
                ["Kit",      caso.kit],
                ["Agente",   caso.agente],
              ].map(([l,v]) => (
                <div key={l} style={{ background:DS.bg, borderRadius:7, padding:"9px 12px" }}>
                  <div style={{ fontFamily:DS.sans, fontSize:9, color:DS.slateL,
                    textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>{l}</div>
                  <div style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, fontWeight:500 }}>{v||"-"}</div>
                </div>
              ))}
            </div>
            <SectionLabel icon="☰">Consulta original del cliente</SectionLabel>
            <div style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:8, padding:"14px 16px" }}>
              <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.inkM, margin:0,
                lineHeight:1.75, fontStyle:"italic" }}>"{caso.asunto}"</p>
            </div>
          </div>
        )}

        {/* TAB: HISTORIAL */}
        {tab==="historial" && (
          <div style={{ animation:"fadeUp .25s ease" }}>
            <SectionLabel icon="◷">Línea de tiempo</SectionLabel>
            {caso.historial.map((h,i) => {
              const color = h.tipo==="ia"?DS.gold:h.tipo==="abogado"?DS.blue:DS.slateL;
              const lbl   = h.tipo==="ia"?"IA":h.tipo==="abogado"?"ABG":"SIS";
              return (
                <div key={i} style={{ display:"flex", gap:12, marginBottom:16 }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:`${color}15`,
                      border:`1px solid ${color}30`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ fontFamily:DS.sans, fontSize:8, fontWeight:800, color }}>{lbl}</span>
                    </div>
                    {i < caso.historial.length-1 && (
                      <div style={{ width:1, flex:1, background:DS.border, marginTop:4 }}/>
                    )}
                  </div>
                  <div style={{ paddingBottom:4 }}>
                    <div style={{ display:"flex", gap:8, alignItems:"baseline", marginBottom:3 }}>
                      <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:700, color }}>{h.actor}</span>
                      <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>{fmtDate(h.ts)}</span>
                    </div>
                    <p style={{ fontFamily:DS.sans, fontSize:12, color:DS.slate, margin:0, lineHeight:1.55 }}>{h.msg}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB: GENERAR DOC */}
        {tab==="generar" && !cerrado && (
          <div style={{ animation:"fadeUp .25s ease" }}>
            <SectionLabel icon="◻">Generador de documentos</SectionLabel>
            <div style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:10, padding:"20px" }}>
              <label style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700, color:DS.slateL,
                textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>
                Tipo de documento
              </label>
              <select value={tipoDoc} onChange={e=>setTipoDoc(e.target.value)}
                style={{ width:"100%", padding:"9px 11px", borderRadius:7,
                  border:`1px solid ${DS.border}`, background:DS.bgCard, fontFamily:DS.sans,
                  fontSize:13, color:DS.ink, outline:"none", cursor:"pointer", marginBottom:16 }}>
                {TIPOS_DOC.map(t=><option key={t}>{t}</option>)}
              </select>
              <div style={{ background:DS.goldFaint, border:`1px solid ${DS.goldLine}`,
                borderRadius:8, padding:"10px 14px", marginBottom:16 }}>
                <p style={{ fontFamily:DS.sans, fontSize:11, color:DS.gold, margin:0, lineHeight:1.5 }}>
                  El documento será generado por el agente IA usando el análisis de este caso
                  y guardado en el expediente Drive.
                </p>
              </div>
              <button onClick={handleGenerar} disabled={procesando}
                style={{ width:"100%", padding:"11px", background: procesando?DS.border:DS.ink,
                  border:`1px solid ${DS.goldLine}`, borderRadius:8,
                  cursor: procesando?"wait":"pointer", fontFamily:DS.sans, fontSize:13,
                  fontWeight:700, color:DS.gold, display:"flex", alignItems:"center",
                  justifyContent:"center", gap:8, transition:"all .15s" }}>
                {procesando
                  ? <><span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>⟳</span> Generando…</>
                  : <>✦ Generar con IA → n8n</>}
              </button>
            </div>
          </div>
        )}

        {/* TAB: CIERRE */}
        {tab==="cierre" && !cerrado && (
          <div style={{ animation:"fadeUp .25s ease" }}>
            <SectionLabel icon="◈">Lección aprendida → RAG</SectionLabel>
            <div style={{ background:DS.goldFaint, border:`1px solid ${DS.goldLine}`,
              borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
              <p style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL, margin:"0 0 8px", lineHeight:1.5 }}>
                Esta lección se guardará en Supabase y alimentará el RAG para mejorar análisis futuros.
              </p>
              <textarea value={leccion} onChange={e=>setLeccion(e.target.value)}
                placeholder="Ej: Art. 161 CT aplica cuando hay necesidades de la empresa documentadas. Siempre verificar cotizaciones al día antes del finiquito…"
                style={{ width:"100%", minHeight:100, background:"#fff",
                  border:`1px solid ${DS.goldLine}`, borderRadius:7, boxSizing:"border-box",
                  padding:"9px 12px", fontFamily:DS.sans, fontSize:12, color:DS.ink,
                  resize:"vertical", outline:"none", lineHeight:1.5 }}
                onFocus={e=>e.target.style.borderColor=DS.gold}
                onBlur={e=>e.target.style.borderColor=DS.goldLine}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <ActionBtn label="✓ Aprobar y enviar" color={DS.green}
                onClick={()=>handleAccion("aprobar")} primary disabled={!tieneAnalisis}/>
              <ActionBtn label="Cerrar caso" color={DS.slate}
                onClick={()=>handleAccion("cerrar")}/>
            </div>
            {!tieneAnalisis && (
              <p style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, marginTop:8 }}>
                * "Aprobar y enviar" requiere análisis del agente primero.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer atajos */}
      {!cerrado && (
        <div style={{ padding:"8px 24px", borderTop:`1px solid ${DS.border}`, background:DS.bg,
          display:"flex", gap:16, alignItems:"center", flexShrink:0 }}>
          {[["A","aprobar"],["E","escalar"],["R","rechazar"],["I","info"],["J/K","navegar"],["F","enfoque"]].map(([k,l]) => (
            <span key={k} style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL,
              display:"flex", alignItems:"center", gap:5 }}>
              <Kbd>{k}</Kbd> {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── QUEUE ZERO ───────────────────────────────────────────────────────────────
function QueueZero({ sesion }) {
  const total = sesion.aprobados + sesion.escalados + sesion.rechazados;
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%",
      flexDirection:"column", gap:6, background:DS.bg, animation:"fadeUp .4s ease" }}>
      <div style={{ width:64, height:64, borderRadius:"50%", background:DS.greenL,
        display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10 }}>
        <span style={{ fontSize:28, color:DS.green }}>✓</span>
      </div>
      <span style={{ fontFamily:DS.serif, fontSize:26, fontWeight:700, color:DS.ink }}>Cola limpia.</span>
      <span style={{ fontFamily:DS.sans, fontSize:13, color:DS.slate }}>Todos los casos fueron revisados.</span>
      {total > 0 && (
        <div style={{ display:"flex", gap:18, marginTop:18 }}>
          {[["Aprobados",sesion.aprobados,DS.green],["Escalados",sesion.escalados,DS.amber],
            ["Rechazados",sesion.rechazados,DS.red]]
            .filter(([,v])=>v>0).map(([l,v,c])=>(
            <div key={l} style={{ textAlign:"center" }}>
              <div style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:c }}>{v}</div>
              <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL,
                textTransform:"uppercase", letterSpacing:"0.08em" }}>{l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PANTALLA: CENTRO DE MANDO ────────────────────────────────────────────────
function PantallaHome({ casos, plazos, setNav, agentesStatus }) {
  const hitl      = casos.filter(c=>c.estado==="HITL").length;
  const escalados = casos.filter(c=>c.estado==="ESCALADO").length;
  const slaVenc   = casos.filter(c=>c.estado!=="CERRADO"&&slaInfo(c.sla_horas,c.horas_transcurridas).label==="Vencido").length;
  const plazCrit  = plazos.filter(p=>p.dias<=3&&!p.gestionado).length;

  const feed = [...casos]
    .flatMap(c => c.historial.map(h => ({
      ...h, caso_id:c.id, empresa:c.cliente.empresa, area:c.area,
    })))
    .sort((a,b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 10);

  const KPICard = ({ label, val, sub, color, onClick, warn }) => (
    <div onClick={onClick}
      style={{ background:DS.bgCard, border:`1px solid ${warn?color:DS.border}`, borderRadius:10,
        padding:"20px 22px", cursor:onClick?"pointer":"default", borderTop:`3px solid ${color}`,
        transition:"box-shadow .15s, transform .15s" }}
      onMouseEnter={e=>{ if(onClick){e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.1)";e.currentTarget.style.transform="translateY(-1px)";} }}
      onMouseLeave={e=>{ e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="translateY(0)"; }}>
      <div style={{ fontFamily:DS.serif, fontSize:48, fontWeight:700, color, lineHeight:1 }}>{val}</div>
      <div style={{ fontFamily:DS.sans, fontSize:12, fontWeight:600, color:DS.ink, marginTop:6 }}>{label}</div>
      {sub && <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL, marginTop:3 }}>{sub}</div>}
      {onClick && <div style={{ fontFamily:DS.sans, fontSize:10, color, marginTop:6, fontWeight:600 }}>Ver →</div>}
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <div style={{ marginBottom:24, animation:"fadeUp .3s ease" }}>
        <h1 style={{ fontFamily:DS.serif, fontSize:26, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>
          {saludo()}, Kurt.
        </h1>
        <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:0 }}>
          {new Date().toLocaleDateString("es-CL",{ weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          {hitl+escalados > 0
            ? ` — ${hitl+escalados} caso${hitl+escalados!==1?"s":""} esperando tu revisión.`
            : " — Todo al día."}
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:28 }}>
        <KPICard label="Cola HITL" val={hitl} sub="Pendientes de revisión"
          color={hitl>0?DS.amber:DS.green} warn={hitl>0} onClick={hitl>0?()=>setNav("hitl"):null}/>
        <KPICard label="Escalados" val={escalados} sub="Requieren atención urgente"
          color={escalados>0?DS.red:DS.green} warn={escalados>0} onClick={escalados>0?()=>setNav("hitl"):null}/>
        <KPICard label="SLA vencido" val={slaVenc} sub="Casos fuera de plazo"
          color={slaVenc>0?DS.red:DS.green} warn={slaVenc>0} onClick={slaVenc>0?()=>setNav("casos"):null}/>
        <KPICard label="Plazos críticos" val={plazCrit} sub="Vencen en ≤3 días"
          color={plazCrit>0?DS.red:DS.green} warn={plazCrit>0} onClick={plazCrit>0?()=>setNav("plazos"):null}/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20 }}>
        {/* Actividad reciente */}
        <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, overflow:"hidden" }}>
          <div style={{ padding:"16px 20px", borderBottom:`1px solid ${DS.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontFamily:DS.serif, fontSize:17, fontWeight:700, color:DS.ink }}>Actividad reciente</span>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:DS.green,
                boxShadow:`0 0 6px ${DS.green}` }}/>
              <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>En vivo · Supabase</span>
            </div>
          </div>
          {feed.length === 0 && (
            <div style={{ padding:"32px 20px", textAlign:"center" }}>
              <span style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL }}>Sin actividad reciente</span>
            </div>
          )}
          {feed.map((item,i) => {
            const color = item.tipo==="ia"?DS.gold:item.tipo==="abogado"?DS.blue:DS.slateL;
            const lbl   = item.tipo==="ia"?"IA":item.tipo==="abogado"?"ABG":"SIS";
            return (
              <div key={i} style={{ padding:"12px 20px",
                borderBottom: i<feed.length-1 ? `1px solid ${DS.border}` : "none",
                display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:`${color}15`,
                  border:`1px solid ${color}25`, display:"flex", alignItems:"center",
                  justifyContent:"center", flexShrink:0, marginTop:1 }}>
                  <span style={{ fontFamily:DS.sans, fontSize:8, fontWeight:800, color }}>{lbl}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", marginBottom:2 }}>
                    <span style={{ fontFamily:DS.sans, fontSize:12, fontWeight:600, color:DS.ink }}>
                      {item.empresa}
                    </span>
                    <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL,
                      flexShrink:0, marginLeft:8 }}>{timeAgo(item.ts)}</span>
                  </div>
                  <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slate, lineHeight:1.4 }}>
                    {item.msg.length>75 ? item.msg.slice(0,75)+"…" : item.msg}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Columna derecha */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* Plazos urgentes */}
          <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"13px 18px", borderBottom:`1px solid ${DS.border}`,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontFamily:DS.serif, fontSize:15, fontWeight:700, color:DS.ink }}>Plazos urgentes</span>
              <button onClick={()=>setNav("plazos")}
                style={{ border:"none", background:"transparent", cursor:"pointer",
                  fontFamily:DS.sans, fontSize:11, color:DS.gold, fontWeight:600 }}>Ver todos →</button>
            </div>
            {plazos.filter(p=>!p.gestionado).slice(0,4).map((p,i,arr) => {
              const color = p.dias<=3?DS.red:p.dias<=7?DS.amber:DS.blue;
              const bg    = p.dias<=3?DS.redL:p.dias<=7?DS.amberL:DS.blueL;
              return (
                <div key={p.id} style={{ padding:"11px 18px",
                  borderBottom: i<arr.length-1 ? `1px solid ${DS.border}` : "none",
                  display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:6, background:bg,
                    display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:DS.serif, fontSize:15, fontWeight:700, color, lineHeight:1 }}>
                      {p.dias===0 ? "HOY" : p.dias < 0 ? "VEN" : p.dias}
                    </span>
                    {p.dias > 0 && <span style={{ fontFamily:DS.sans, fontSize:6, color, fontWeight:600 }}>días</span>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:DS.sans, fontSize:11, fontWeight:600, color:DS.ink,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {p.cliente.split(" ").slice(0,2).join(" ")}
                    </div>
                    <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {p.tipo} — {(p.asunto||"").slice(0,30)}{(p.asunto||"").length>30?"…":""}
                    </div>
                  </div>
                </div>
              );
            })}
            {plazos.filter(p=>!p.gestionado).length === 0 && (
              <div style={{ padding:"20px 18px", textAlign:"center" }}>
                <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.slateL }}>✓ Sin plazos urgentes</span>
              </div>
            )}
          </div>

          {/* Estado agentes */}
          <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"13px 18px", borderBottom:`1px solid ${DS.border}` }}>
              <span style={{ fontFamily:DS.serif, fontSize:15, fontWeight:700, color:DS.ink }}>Estado agentes</span>
            </div>
            {agentesStatus.map((ag,i) => {
              const color = ag.estado==="ok"?DS.green:ag.estado==="warn"?DS.amber:DS.red;
              const lbl   = ag.estado==="ok"?"OK":ag.estado==="warn"?"Atención":"Error";
              return (
                <div key={ag.id} style={{ padding:"9px 18px",
                  borderBottom: i<agentesStatus.length-1 ? `1px solid ${DS.border}` : "none",
                  display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:color, flexShrink:0 }}/>
                  <span style={{ fontFamily:DS.mono, fontSize:10, color:DS.gold, width:22 }}>{ag.id}</span>
                  <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.ink, flex:1 }}>{ag.nombre}</span>
                  <span style={{ fontFamily:DS.sans, fontSize:9, fontWeight:700, color,
                    background:`${color}15`, padding:"2px 6px", borderRadius:3 }}>{lbl}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PANTALLA: CASOS / COLA HITL ──────────────────────────────────────────────
function PantallaCasos({
  casos, actualizarEstado, actualizarNota, actualizarDatos, eliminarCaso, cerrarCaso,
  showToast, soloHITL=false, sesion, setSesion, selIdExterno, setSelIdExterno,
}) {
  const [selId,        setSelId]        = useState(selIdExterno || null);
  const [search,       setSearch]       = useState("");
  const [filtroEstado, setFiltroEstado] = useState(soloHITL ? "HITL_ESC" : "TODOS");
  const [filtroArea,   setFiltroArea]   = useState("TODAS");
  const [modalEditar,  setModalEditar]  = useState(null);
  const [modalEliminar,setModalEliminar]= useState(null);
  const [saliendo,     setSaliendo]     = useState(null);
  const [focus,        setFocus]        = useState(false);

  useEffect(() => {
    if (selIdExterno) { setSelId(selIdExterno); setSelIdExterno?.(null); }
  }, [selIdExterno]);

  const areas = ["TODAS", ...[...new Set(casos.map(c=>c.area).filter(Boolean))]];

  const filtered = casos.filter(c => {
    let okE;
    if (filtroEstado==="TODOS")     okE = true;
    else if (filtroEstado==="HITL_ESC") okE = c.estado==="HITL"||c.estado==="ESCALADO";
    else okE = c.estado===filtroEstado;
    const okA = filtroArea==="TODAS" || c.area===filtroArea;
    const q   = search.toLowerCase();
    const okS = !q
      || c.cliente.empresa.toLowerCase().includes(q)
      || c.id.toLowerCase().includes(q)
      || c.asunto.toLowerCase().includes(q)
      || c.analisis.resumen.toLowerCase().includes(q)
      || c.cliente.nombre.toLowerCase().includes(q);
    return okE && okA && okS;
  }).sort((a,b) => {
    if (!soloHITL) return 0;
    const score = c => (c.estado==="ESCALADO"?1000:0) + (c.horas_transcurridas/c.sla_horas)*100;
    return score(b) - score(a);
  });

  const selCaso = casos.find(c=>c.uuid===selId);
  const selIdx  = filtered.findIndex(c=>c.uuid===selId);

  useEffect(() => {
    if ((!selId || !filtered.find(c=>c.uuid===selId)) && filtered.length>0)
      setSelId(filtered[0].uuid);
  }, [filtroEstado, filtroArea, search, filtered.length]);

  // J/K navigation
  useEffect(() => {
    function onKey(e) {
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k==="j"||e.key==="ArrowDown") {
        e.preventDefault();
        const i = filtered.findIndex(c=>c.uuid===selId);
        if (i < filtered.length-1) setSelId(filtered[i+1].uuid);
      }
      if (k==="k"||e.key==="ArrowUp") {
        e.preventDefault();
        const i = filtered.findIndex(c=>c.uuid===selId);
        if (i > 0) setSelId(filtered[i-1].uuid);
      }
      if (e.key==="Escape" && focus) setFocus(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selId, focus]);

  async function handleAccion(uuid, tipo, data) {
    const caso = casos.find(c=>c.uuid===uuid);
    if (!caso) return;

    // ── PROCESAR ──
    if (tipo==="procesar") {
      showToast("Enviando al agente IA…","info");
      await actualizarEstado(uuid,"EN_REVISION");
      const r = await dispararWebhook(WH.procesar, { caso_id:uuid, area:caso.area });
      if (r.ok) showToast("Agente procesando — el dashboard se actualizará solo","ok");
      else showToast("Error al conectar con n8n","err");
      return;
    }

    // ── GUARDAR NOTA ──
    if (tipo==="guardarNota") {
      const e = await actualizarNota(uuid, data);
      if (e) showToast("Error al guardar nota","err");
      else   showToast("Nota guardada en Supabase","ok");
      return;
    }

    // ── CAMBIAR ESTADO MANUAL ──
    if (tipo==="cambiarEstado") {
      const e = await actualizarEstado(uuid, data);
      if (e) showToast("Error al cambiar estado","err");
      else   showToast(`Estado → ${ESTADO_CFG[data]?.label||data}`,"ok");
      return;
    }

    // ── APROBAR ──
    if (tipo==="aprobar") {
      showToast("Enviando aprobación…","info");
      setSesion(s=>({...s,aprobados:s.aprobados+1}));
      const r = await dispararWebhook(WH.aprobar, {
        caso_id:  uuid,
        nota:     data?.nota||"",
        folio:    caso.id,
        contacto_email: caso.cliente.email,
        contacto_nombre:caso.cliente.nombre,
      });
      if (r.ok) {
        await actualizarEstado(uuid,"CERRADO");
        showToast("Borrador aprobado y enviado al cliente","ok");
        // Flow mode: auto-avanzar en cola HITL
        if (soloHITL) autoAvanzar(uuid);
      } else showToast("Error al aprobar","err");
      return;
    }

    // ── ESCALAR ──
    if (tipo==="escalar") {
      showToast("Escalando caso…","info");
      setSesion(s=>({...s,escalados:s.escalados+1}));
      const r = await dispararWebhook(WH.escalar, {
        caso_id: uuid, area: caso.area, folio: caso.id,
      });
      await actualizarEstado(uuid,"ESCALADO");
      if (r.ok) showToast("Caso escalado — notificación enviada a Slack","warn");
      else      showToast("Caso escalado en Supabase","warn");
      return;
    }

    // ── RECHAZAR (devolver a HITL) ──
    if (tipo==="rechazar") {
      setSesion(s=>({...s,rechazados:s.rechazados+1}));
      await actualizarEstado(uuid,"HITL");
      showToast("Caso devuelto a cola HITL","warn");
      return;
    }

    // ── INFO ──
    if (tipo==="info") {
      showToast("Solicitud de información enviada al cliente","ok");
      return;
    }

    // ── CERRAR ──
    if (tipo==="cerrar") {
      const e = await cerrarCaso(uuid, data?.leccion||"");
      if (e) showToast("Error al cerrar caso","err");
      else {
        if (data?.leccion) {
          await dispararWebhook(WH.cerrar, { caso_id:uuid, leccion:data.leccion });
        }
        showToast("Caso cerrado — lección guardada en Supabase","ok");
        if (soloHITL) autoAvanzar(uuid);
      }
      return;
    }

    // ── GENERAR DOC ──
    if (tipo==="generar_doc") {
      showToast("Generando documento…","info");
      const r = await dispararWebhook(WH.procesar, {
        caso_id:uuid, tipo_doc:data?.tipo, accion:"generar_documento",
      });
      if (r.ok) showToast(`Documento "${data?.tipo}" generado → Drive ✓`,"ok");
      else      showToast("Error al generar documento","err");
      return;
    }
  }

  function autoAvanzar(uuid) {
    setSaliendo(uuid);
    setTimeout(() => {
      setSaliendo(null);
      const restantes = filtered.filter(c=>c.uuid!==uuid);
      if (restantes.length>0) {
        const i = filtered.findIndex(c=>c.uuid===uuid);
        setSelId(restantes[Math.min(i, restantes.length-1)].uuid);
      }
    }, 280);
  }

  async function handleSaveEditar(form) {
    const e = await actualizarDatos(selCaso.uuid, form);
    if (e) showToast("Error al actualizar","err");
    else { showToast("Guardado en Supabase","ok"); setModalEditar(null); }
  }

  async function handleEliminar() {
    const uuid = modalEliminar.uuid;
    const e = await eliminarCaso(uuid);
    if (e) showToast("Error al eliminar","err");
    else {
      showToast("Caso eliminado","warn");
      setModalEliminar(null);
      const next = casos.find(c=>c.uuid!==uuid);
      setSelId(next?.uuid||null);
    }
  }

  const flowInfo = soloHITL && filtered.length>0 && selIdx>=0
    ? `${selIdx+1} de ${filtered.length}` : null;

  return (
    <>
      {modalEditar   && <ModalEditar   caso={modalEditar}   onSave={handleSaveEditar} onClose={()=>setModalEditar(null)}/>}
      {modalEliminar && <ModalEliminar caso={modalEliminar} onConfirm={handleEliminar} onClose={()=>setModalEliminar(null)}/>}

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Lista */}
        <div style={{ width: focus?0:308, background:DS.bgCard,
          borderRight: focus?"none":`1px solid ${DS.border}`,
          display:"flex", flexDirection:"column", overflow:"hidden",
          transition:"width .25s ease" }}>
          <div style={{ padding:"14px 16px 10px", background:DS.bg,
            borderBottom:`1px solid ${DS.border}`, flexShrink:0, minWidth:308 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ fontFamily:DS.serif, fontSize:17, fontWeight:700, color:DS.ink }}>
                {soloHITL ? "Cola HITL" : "Casos"}
              </span>
              <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{filtered.length}</span>
            </div>
            <div style={{ position:"relative", marginBottom:10 }}>
              <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)",
                fontSize:13, color:DS.slateL }}>⌕</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder={soloHITL?"Buscar en cola…":"Empresa, asunto, análisis…"}
                style={{ width:"100%", paddingLeft:28, height:32, background:DS.bgInput,
                  border:`1px solid ${DS.border}`, borderRadius:7, boxSizing:"border-box",
                  fontFamily:DS.sans, fontSize:12, color:DS.ink, outline:"none" }}
                onFocus={e=>e.target.style.borderColor=DS.gold}
                onBlur={e=>e.target.style.borderColor=DS.border}/>
            </div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:6 }}>
              {["TODOS","HITL","ESCALADO","EN_REVISION","CERRADO"].map(e => {
                const cfg = ESTADO_CFG[e];
                const active = filtroEstado===e;
                return (
                  <button key={e} onClick={()=>setFiltroEstado(e)}
                    style={{ fontFamily:DS.sans, fontSize:9, fontWeight:600, padding:"3px 8px",
                      borderRadius:4, cursor:"pointer",
                      border:`1px solid ${active?(cfg?.dot||DS.gold):DS.border}`,
                      background:active?(cfg?cfg.bg:DS.goldFaint):"transparent",
                      color:active?(cfg?.txt||DS.gold):DS.slateL }}>
                    {e==="TODOS"?"Todos":cfg?.label||e}
                  </button>
                );
              })}
            </div>
            {!soloHITL && (
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                {areas.slice(0,7).map(a => {
                  const active = filtroArea===a;
                  return (
                    <button key={a} onClick={()=>setFiltroArea(a)}
                      style={{ fontFamily:DS.sans, fontSize:9, fontWeight:600, padding:"3px 8px",
                        borderRadius:4, cursor:"pointer",
                        border:`1px solid ${active?(AREA_COLOR[a]||DS.gold):DS.border}`,
                        background:active?`${(AREA_COLOR[a]||DS.gold)}20`:"transparent",
                        color:active?(AREA_COLOR[a]||DS.gold):DS.slateL }}>
                      {a==="TODAS"?"Todas":a}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ flex:1, overflowY:"auto", minWidth:308 }}>
            {filtered.length===0 ? (
              <div style={{ padding:"40px 20px", textAlign:"center",
                display:"flex", flexDirection:"column", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:28, color: soloHITL?DS.green:DS.slateXL }}>
                  {soloHITL?"✓":"⌕"}
                </span>
                <span style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.slate }}>
                  {soloHITL?"Cola limpia":"Sin resultados"}
                </span>
                <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>
                  {soloHITL?"No hay casos pendientes":"Ajusta los filtros"}
                </span>
              </div>
            ) : filtered.map(c => (
              <CasoRow key={c.uuid} caso={c} selected={selId===c.uuid}
                onClick={()=>setSelId(c.uuid)} saliendo={saliendo===c.uuid}/>
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div style={{ flex:1, overflow:"hidden" }}>
          {filtered.length===0 && soloHITL
            ? <QueueZero sesion={sesion}/>
            : selCaso
              ? <CasoDetail caso={selCaso} onAccion={handleAccion}
                  onEditar={c=>setModalEditar(c)} onEliminar={c=>setModalEliminar(c)}
                  flowInfo={flowInfo} focus={focus} setFocus={setFocus}/>
              : <Empty icon="☰" msg="Selecciona un caso" sub="Usa J/K o las flechas para navegar"/>
          }
        </div>
      </div>
    </>
  );
}

// ─── PANTALLA: AGENDA LEGAL ───────────────────────────────────────────────────
function PantallaPlazos({ plazos, loading, marcarGestionado }) {
  const grupos = [
    { label:"Críticos — vencen en ≤3 días",        items:plazos.filter(p=>p.dias<=3&&!p.gestionado) },
    { label:"Próximos — 4 a 15 días",              items:plazos.filter(p=>p.dias>3&&p.dias<=15&&!p.gestionado) },
    { label:"En el horizonte — más de 15 días",    items:plazos.filter(p=>p.dias>15&&!p.gestionado) },
    { label:"Gestionados",                         items:plazos.filter(p=>p.gestionado) },
  ];

  if (loading) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
      flexDirection:"column", gap:12, background:DS.bg }}>
      <span style={{ fontSize:32, color:DS.slateXL, display:"inline-block", animation:"spin 1.5s linear infinite" }}>⟳</span>
      <span style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL }}>Cargando plazos desde Supabase…</span>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>
        Agenda Legal
      </h1>
      <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:"0 0 28px" }}>
        Vencimientos activos — marcas INAPI, SII, DT y contratos · {plazos.length} plazos
      </p>
      {plazos.length===0 && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
          flexDirection:"column", gap:12, padding:"60px 0" }}>
          <span style={{ fontSize:40, color:DS.slateXL }}>◷</span>
          <span style={{ fontFamily:DS.sans, fontSize:14, color:DS.slateL }}>Sin plazos activos</span>
        </div>
      )}
      {grupos.map(({ label, items }) => items.length>0 && (
        <div key={label} style={{ marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700, color:DS.slateL,
              textTransform:"uppercase", letterSpacing:"0.12em" }}>{label}</span>
            <div style={{ flex:1, height:1, background:DS.border }}/>
            <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{items.length}</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {items.map(p => {
              const color = p.gestionado?DS.green:p.dias<0?DS.red:p.dias<=3?DS.red:p.dias<=7?DS.amber:DS.blue;
              const bg    = p.gestionado?DS.greenL:p.dias<=3?DS.redL:p.dias<=7?DS.amberL:DS.blueL;
              const diasLabel = p.gestionado?"✓":p.dias<0?"VENC":p.dias===0?"HOY":`${p.dias}d`;
              return (
                <div key={p.id} style={{ background:DS.bgCard, border:`1px solid ${DS.border}`,
                  borderRadius:10, padding:"14px 18px", display:"flex", alignItems:"center", gap:14,
                  opacity: p.gestionado?0.6:1, transition:"opacity .3s" }}>
                  <div style={{ width:54, height:54, borderRadius:9, background:bg,
                    display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:DS.serif, fontSize:p.dias===0||p.gestionado?18:22,
                      fontWeight:700, color, lineHeight:1 }}>{diasLabel}</span>
                    {!p.gestionado && p.dias>0 && (
                      <span style={{ fontFamily:DS.sans, fontSize:7, color, fontWeight:600 }}>días</span>
                    )}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                      <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700, color,
                        background:bg, padding:"2px 8px", borderRadius:4 }}>{p.tipo}</span>
                    </div>
                    <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink, marginBottom:2 }}>
                      {p.cliente}
                    </div>
                    <div style={{ fontFamily:DS.sans, fontSize:12, color:DS.slate }}>{p.asunto}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, display:"flex",
                    flexDirection:"column", alignItems:"flex-end", gap:8 }}>
                    <div>
                      <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>Vence</div>
                      <div style={{ fontFamily:DS.serif, fontSize:15, fontWeight:700, color:DS.ink }}>
                        {new Date(p.fecha).toLocaleDateString("es-CL",{ day:"2-digit", month:"short" })}
                      </div>
                    </div>
                    {!p.gestionado && (
                      <button onClick={()=>marcarGestionado(p.id)}
                        style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${DS.green}`,
                          background:"transparent", cursor:"pointer", fontFamily:DS.sans,
                          fontSize:10, fontWeight:700, color:DS.green, whiteSpace:"nowrap" }}
                        onMouseEnter={e=>{ e.currentTarget.style.background=DS.green; e.currentTarget.style.color="#fff"; }}
                        onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.color=DS.green; }}>
                        Marcar gestionado
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PANTALLA: CLIENTES ───────────────────────────────────────────────────────
function PantallaClientes({ casos }) {
  const [sel,    setSel]    = useState(null);
  const [search, setSearch] = useState("");

  // Construir mapa de clientes desde casos reales de Supabase
  const clientesMap = casos.reduce((acc, c) => {
    const key = c.cliente.rut || c.cliente.empresa;
    if (!acc[key]) acc[key] = {
      rut:     c.cliente.rut,
      nombre:  c.cliente.nombre,
      empresa: c.cliente.empresa,
      tipo:    c.cliente.tipo,
      casos:   [],
    };
    acc[key].casos.push(c);
    return acc;
  }, {});
  const clientes = Object.values(clientesMap);

  const filtered = clientes.filter(cl =>
    !search ||
    cl.empresa.toLowerCase().includes(search.toLowerCase()) ||
    cl.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (cl.rut||"").includes(search)
  );
  const cliente = sel != null ? filtered[sel] : null;

  return (
    <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
      <div style={{ width:288, background:DS.bgCard, borderRight:`1px solid ${DS.border}`,
        display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"14px 16px 10px", background:DS.bg,
          borderBottom:`1px solid ${DS.border}`, flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontFamily:DS.serif, fontSize:17, fontWeight:700, color:DS.ink }}>Clientes</span>
            <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{filtered.length}</span>
          </div>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)",
              fontSize:13, color:DS.slateL }}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar empresa o nombre…"
              style={{ width:"100%", paddingLeft:28, height:32, background:DS.bgInput,
                border:`1px solid ${DS.border}`, borderRadius:7, boxSizing:"border-box",
                fontFamily:DS.sans, fontSize:12, color:DS.ink, outline:"none" }}
              onFocus={e=>e.target.style.borderColor=DS.gold}
              onBlur={e=>e.target.style.borderColor=DS.border}/>
          </div>
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {filtered.map((cl,i) => (
            <div key={cl.rut||i} onClick={()=>setSel(i)}
              style={{ padding:"13px 16px", borderBottom:`1px solid ${DS.border}`, cursor:"pointer",
                background:sel===i?DS.goldFaint:DS.bgCard,
                borderLeft:`3px solid ${sel===i?DS.gold:"transparent"}`, transition:"all .1s" }}
              onMouseEnter={e=>{ if(sel!==i) e.currentTarget.style.background=DS.bg; }}
              onMouseLeave={e=>{ if(sel!==i) e.currentTarget.style.background=DS.bgCard; }}>
              <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink, marginBottom:3 }}>
                {cl.empresa}
              </div>
              <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>
                {cl.tipo} · {cl.casos.length} caso{cl.casos.length!==1?"s":""}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", background:DS.bg, padding:"28px 32px" }}>
        {!cliente
          ? <Empty icon="◈" msg="Selecciona un cliente" sub="Historial y casos desde Supabase"/>
          : (
            <div style={{ animation:"fadeUp .25s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:22 }}>
                <div style={{ width:46, height:46, borderRadius:10, background:DS.ink,
                  border:`1px solid ${DS.goldLine}`, display:"flex", alignItems:"center",
                  justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontFamily:DS.serif, fontSize:22, fontWeight:700, color:DS.gold }}>
                    {(cliente.empresa||"?")[0]}
                  </span>
                </div>
                <div>
                  <h2 style={{ fontFamily:DS.serif, fontSize:22, fontWeight:700, color:DS.ink, margin:0 }}>
                    {cliente.empresa}
                  </h2>
                  <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>
                    RUT {cliente.rut} · {cliente.tipo}
                  </div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:22 }}>
                {[
                  { label:"Total casos",   val:cliente.casos.length, color:DS.blue },
                  { label:"En curso",      val:cliente.casos.filter(c=>c.estado!=="CERRADO").length, color:DS.amber },
                  { label:"Cerrados",      val:cliente.casos.filter(c=>c.estado==="CERRADO").length, color:DS.green },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background:DS.bgCard, border:`1px solid ${DS.border}`,
                    borderRadius:9, padding:"14px 16px" }}>
                    <div style={{ fontFamily:DS.sans, fontSize:9, color:DS.slateL,
                      textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>{label}</div>
                    <div style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color }}>{val}</div>
                  </div>
                ))}
              </div>
              <SectionLabel icon="☰">Historial de casos</SectionLabel>
              {cliente.casos.map(c => {
                const est = ESTADO_CFG[c.estado] || ESTADO_CFG.PENDIENTE;
                return (
                  <div key={c.uuid} style={{ background:DS.bgCard, border:`1px solid ${DS.border}`,
                    borderRadius:9, padding:"12px 16px", marginBottom:8,
                    display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:28, height:28, borderRadius:5,
                      background:AREA_COLOR[c.area]||DS.slate,
                      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:800, color:"#fff" }}>
                        {AREA_ICON[c.area]||"?"}
                      </span>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                        <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:700, color:DS.gold }}>{c.id}</span>
                        <Badge label={est.label} color={est.dot} bg={est.bg} size={9}/>
                      </div>
                      <div style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink }}>{c.asunto}</div>
                      <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>
                        {c.area} · {fmtDate(c.ingreso)}
                      </div>
                    </div>
                    <div style={{ width:100 }}><ConfBar val={c.analisis.confianza} showLabel={false}/></div>
                  </div>
                );
              })}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ─── PANTALLA: MÉTRICAS ───────────────────────────────────────────────────────
function PantallaMetricas({ casos }) {
  const [periodo, setPeriodo] = useState("total");

  const confProm  = casos.filter(c=>c.analisis.confianza>0).length
    ? casos.filter(c=>c.analisis.confianza>0).reduce((s,c)=>s+c.analisis.confianza,0)
      / casos.filter(c=>c.analisis.confianza>0).length
    : 0;
  const slaOk    = casos.filter(c=>slaInfo(c.sla_horas,c.horas_transcurridas).label!=="Vencido").length;
  const slaRate  = casos.length ? Math.round((slaOk/casos.length)*100) : 0;
  const cerrados = casos.filter(c=>c.estado==="CERRADO").length;
  const conAnalisis = casos.filter(c=>c.analisis.resumen&&c.analisis.resumen.length>10).length;

  const porArea = [...new Set(casos.map(c=>c.area))].map(area => ({
    area, count:casos.filter(c=>c.area===area).length, color:AREA_COLOR[area]||DS.slate,
  })).sort((a,b)=>b.count-a.count);
  const maxCount = Math.max(...porArea.map(p=>p.count),1);

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:0 }}>Métricas</h1>
        <div style={{ display:"flex", gap:4 }}>
          {[["semana","Esta semana"],["mes","Este mes"],["total","Total"]].map(([v,l]) => (
            <button key={v} onClick={()=>setPeriodo(v)}
              style={{ padding:"6px 14px", borderRadius:6,
                border:`1px solid ${periodo===v?DS.gold:DS.border}`,
                background:periodo===v?DS.goldFaint:"transparent", cursor:"pointer",
                fontFamily:DS.sans, fontSize:11, fontWeight:periodo===v?700:400,
                color:periodo===v?DS.gold:DS.slate }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
        {[
          { label:"Total casos",       val:casos.length,             color:DS.ink },
          { label:"Con análisis IA",   val:conAnalisis,              color:DS.purple },
          { label:"Tasa SLA",          val:`${slaRate}%`,            color:slaRate>=80?DS.green:DS.amber },
          { label:"Confianza media",   val:`${Math.round(confProm*100)}%`, color:confProm>=0.7?DS.green:DS.amber },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background:DS.bgCard, border:`1px solid ${DS.border}`,
            borderRadius:10, padding:"20px 22px", borderTop:`3px solid ${color}` }}>
            <div style={{ fontFamily:DS.serif, fontSize:42, fontWeight:700, color, lineHeight:1 }}>{val}</div>
            <div style={{ fontFamily:DS.sans, fontSize:12, fontWeight:600, color:DS.ink, marginTop:6 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, padding:"20px 24px" }}>
          <SectionLabel icon="↗">Casos por área</SectionLabel>
          {porArea.map(({ area, count, color }) => (
            <div key={area} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
              <div style={{ width:22, height:22, borderRadius:4, background:color,
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontFamily:DS.sans, fontSize:9, fontWeight:800, color:"#fff" }}>
                  {AREA_ICON[area]||"?"}
                </span>
              </div>
              <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, width:80 }}>{area}</span>
              <div style={{ flex:1, height:20, background:DS.bg, borderRadius:4, overflow:"hidden" }}>
                <div style={{ width:`${(count/maxCount)*100}%`, height:"100%", background:color,
                  borderRadius:4, transition:"width .6s" }}/>
              </div>
              <span style={{ fontFamily:DS.sans, fontSize:12, fontWeight:700, color:DS.ink, minWidth:16 }}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, padding:"20px 24px" }}>
          <SectionLabel icon="⚙">Confianza por área</SectionLabel>
          {porArea.map(({ area, count, color }) => {
            const casosArea = casos.filter(c=>c.area===area&&c.analisis.confianza>0);
            const confArea  = casosArea.length
              ? casosArea.reduce((s,c)=>s+c.analisis.confianza,0)/casosArea.length : 0;
            return (
              <div key={area} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <span style={{ fontFamily:DS.mono, fontSize:10, color:DS.gold, width:24, fontWeight:700 }}>
                  {AREA_ICON[area]||"?"}
                </span>
                <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.ink, flex:1 }}>{area}</span>
                <div style={{ width:100 }}><ConfBar val={confArea} showLabel={false}/></div>
              </div>
            );
          })}
          <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${DS.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slate }}>Cerrados</span>
              <span style={{ fontFamily:DS.serif, fontSize:18, fontWeight:700, color:DS.green }}>{cerrados}</span>
            </div>
            <div style={{ height:4, background:DS.bg, borderRadius:2 }}>
              <div style={{ width:`${casos.length?Math.round((cerrados/casos.length)*100):0}%`,
                height:"100%", background:DS.green, borderRadius:2 }}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PANTALLA: SISTEMA ────────────────────────────────────────────────────────
function PantallaSystem({ agentesStatus }) {
  const CONEXIONES = [
    { nombre:"Supabase + pgvector",       estado:"ok",   detalle:"kwyicmnbquqpuoxmsxgt · São Paulo · RLS activo · Realtime on" },
    { nombre:"n8n (workflows A0–A7)",     estado:"ok",   detalle:"n8n.srv1108143.hstgr.cloud · Hostinger VPS · 8 flujos activos" },
    { nombre:"Claude Sonnet + Haiku",     estado:"ok",   detalle:"A0 Haiku (clasificación) · A1–A7 Sonnet (análisis)" },
    { nombre:"OpenAI Embeddings",         estado:"ok",   detalle:"text-embedding-3-small · vectorización de documentos" },
    { nombre:"Slack HITL",                estado:"ok",   detalle:"7 canales · #per-general · notificaciones activas" },
    { nombre:"Gmail OAuth2",              estado:"ok",   detalle:"pymeenregla@gmail.com · envíos automáticos activos" },
    { nombre:"Google Drive",              estado:"ok",   detalle:"Expedientes automáticos por caso · OAuth2 conectado" },
    { nombre:"Clerk Auth",                estado:"warn", detalle:"Modo desarrollo — activar producción antes de abrir acceso" },
  ];

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>Sistema IA</h1>
      <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:"0 0 24px" }}>
        Estado en tiempo real — agentes A0–A7 y conexiones
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:24 }}>
        {agentesStatus.map(ag => {
          const color = ag.estado==="ok"?DS.green:ag.estado==="warn"?DS.amber:DS.red;
          const bg    = ag.estado==="ok"?DS.greenL:ag.estado==="warn"?DS.amberL:DS.redL;
          const lbl   = ag.estado==="ok"?"Operativo":ag.estado==="warn"?"Atención":"Error";
          const confVal = ag.conf_prom ?? 0;
          return (
            <div key={ag.id} style={{ background:DS.bgCard,
              border:`1px solid ${ag.estado!=="ok"?color:DS.border}`, borderRadius:10, padding:"16px 18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:7, background:DS.ink,
                    border:`1px solid ${DS.goldLine}`, display:"flex", alignItems:"center",
                    justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:DS.mono, fontSize:11, fontWeight:700, color:DS.gold }}>{ag.id}</span>
                  </div>
                  <div>
                    <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink }}>{ag.nombre}</div>
                    <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>
                      {ag.casos_total > 0
                        ? `${ag.casos_total} caso${ag.casos_total!==1?"s":""} · ${ag.escalados} escalado${ag.escalados!==1?"s":""}`
                        : "Sin casos aún"}
                    </div>
                  </div>
                </div>
                <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700, color,
                  background:bg, padding:"3px 9px", borderRadius:4 }}>{lbl}</span>
              </div>
              {ag.conf_prom !== null
                ? <ConfBar val={confVal}/>
                : <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, fontStyle:"italic" }}>
                    Sin datos de confianza aún
                  </div>
              }
              {ag.estado!=="ok" && (
                <div style={{ marginTop:10, padding:"8px 12px", background:bg, borderRadius:7 }}>
                  <span style={{ fontFamily:DS.sans, fontSize:11, color }}>
                    {ag.estado==="err"
                      ? "⚑ Requiere intervención — confianza crítica o escalación alta"
                      : "⚠ Tasa de escalación elevada o confianza baja — revisar prompt"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${DS.border}` }}>
          <SectionLabel icon="◈">Conexiones del sistema</SectionLabel>
        </div>
        {CONEXIONES.map((c,i) => (
          <div key={c.nombre} style={{ padding:"12px 20px",
            borderBottom: i<CONEXIONES.length-1 ? `1px solid ${DS.border}` : "none",
            background: c.estado==="warn" ? DS.amberXL : "transparent",
            display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:7, height:7, borderRadius:"50%",
              background: c.estado==="ok"?DS.green:DS.amber,
              boxShadow:`0 0 5px ${c.estado==="ok"?DS.green:DS.amber}`, flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink }}>{c.nombre}</div>
              <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{c.detalle}</div>
            </div>
            <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700,
              color: c.estado==="ok"?DS.green:DS.amber,
              background: c.estado==="ok"?DS.greenL:DS.amberL,
              padding:"3px 8px", borderRadius:4 }}>
              {c.estado==="ok" ? "Conectado" : "Pendiente"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PANTALLA: RAG ────────────────────────────────────────────────────────────
const RAG_FUENTES = [
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

function PantallaRAG() {
  const [filtroArea, setFiltroArea] = useState("TODAS");
  const [busqueda,   setBusqueda]   = useState("");
  const areas = ["TODAS", ...[...new Set(RAG_FUENTES.map(f=>f.area))]];
  const totalChunks = RAG_FUENTES.reduce((s,f)=>s+f.chunks,0);
  const porArea = [...new Set(RAG_FUENTES.map(f=>f.area))].map(a => ({
    area:a, chunks:RAG_FUENTES.filter(f=>f.area===a).reduce((s,f)=>s+f.chunks,0),
    fuentes:RAG_FUENTES.filter(f=>f.area===a).length, color:AREA_COLOR[a]||DS.slate,
  }));
  const filtered = RAG_FUENTES.filter(f => {
    const okA = filtroArea==="TODAS"||f.area===filtroArea;
    const q   = busqueda.toLowerCase();
    const okB = !q||f.nombre.toLowerCase().includes(q)||f.area.toLowerCase().includes(q);
    return okA&&okB;
  });

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>RAG y Fuentes</h1>
      <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:"0 0 24px" }}>
        Base de conocimiento legal vectorial — {RAG_FUENTES.length} fuentes · {totalChunks.toLocaleString("es-CL")} chunks
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        {[
          { label:"Fuentes indexadas", val:RAG_FUENTES.length, color:DS.blue },
          { label:"Chunks totales", val:totalChunks.toLocaleString("es-CL"), color:DS.purple },
          { label:"Templates", val:34, color:DS.gold },
          { label:"Alertas", val:RAG_FUENTES.filter(f=>f.estado==="warn").length, color:DS.amber },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background:DS.bgCard, border:`1px solid ${DS.border}`,
            borderRadius:10, padding:"16px 18px" }}>
            <div style={{ fontFamily:DS.sans, fontSize:9, fontWeight:700, color:DS.slateL,
              textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>{label}</div>
            <div style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10,
        padding:"20px 24px", marginBottom:20 }}>
        <SectionLabel icon="↗">Distribución por área</SectionLabel>
        {porArea.sort((a,b)=>b.chunks-a.chunks).map(({ area, chunks, fuentes, color }) => (
          <div key={area} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
            <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, width:100 }}>{area}</span>
            <div style={{ flex:1, height:22, background:DS.bg, borderRadius:4, overflow:"hidden" }}>
              <div style={{ width:`${(chunks/totalChunks)*100}%`, height:"100%", background:color,
                borderRadius:4, transition:"width .6s" }}/>
            </div>
            <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:700, color:DS.ink,
              minWidth:60, textAlign:"right" }}>{chunks.toLocaleString("es-CL")}</span>
            <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, minWidth:70 }}>
              {fuentes} fuente{fuentes!==1?"s":""}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:14, flexWrap:"wrap" }}>
        <div style={{ position:"relative", flex:1, maxWidth:320 }}>
          <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)",
            fontSize:13, color:DS.slateL }}>⌕</span>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar fuente…"
            style={{ width:"100%", paddingLeft:30, height:34, background:DS.bgCard,
              border:`1px solid ${DS.border}`, borderRadius:7, boxSizing:"border-box",
              fontFamily:DS.sans, fontSize:12, color:DS.ink, outline:"none" }}
            onFocus={e=>e.target.style.borderColor=DS.gold}
            onBlur={e=>e.target.style.borderColor=DS.border}/>
        </div>
        {areas.map(a => (
          <button key={a} onClick={()=>setFiltroArea(a)}
            style={{ padding:"5px 12px", borderRadius:6,
              border:`1px solid ${filtroArea===a?DS.gold:DS.border}`,
              background:filtroArea===a?DS.goldFaint:"transparent", cursor:"pointer",
              fontFamily:DS.sans, fontSize:11, fontWeight:filtroArea===a?700:400,
              color:filtroArea===a?DS.gold:DS.slate }}>{a}</button>
        ))}
      </div>
      <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:DS.bg }}>
                {["ID","Nombre","Área","Chunks","Tamaño","Actualización","Estado"].map(h=>(
                  <th key={h} style={{ padding:"10px 14px", fontFamily:DS.sans, fontSize:10, fontWeight:700,
                    color:DS.slateL, textTransform:"uppercase", letterSpacing:"0.08em",
                    textAlign:"left", borderBottom:`1px solid ${DS.border}`, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f,i)=>(
                <tr key={f.id} style={{ borderBottom:`1px solid ${DS.border}`,
                  background:i%2===0?DS.bgCard:DS.bg }}>
                  <td style={{ padding:"10px 14px", fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{f.id}</td>
                  <td style={{ padding:"10px 14px", fontFamily:DS.sans, fontSize:12, fontWeight:600,
                    color:DS.ink, maxWidth:240 }}>{f.nombre}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ background:`${AREA_COLOR[f.area]||DS.slate}20`,
                      color:AREA_COLOR[f.area]||DS.slate, padding:"2px 8px",
                      borderRadius:4, fontFamily:DS.sans, fontSize:10, fontWeight:700 }}>{f.area}</span>
                  </td>
                  <td style={{ padding:"10px 14px", fontFamily:DS.serif, fontSize:16,
                    fontWeight:700, color:DS.ink }}>{f.chunks.toLocaleString("es-CL")}</td>
                  <td style={{ padding:"10px 14px", fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{f.size}</td>
                  <td style={{ padding:"10px 14px", fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>
                    {new Date(f.fecha).toLocaleDateString("es-CL")}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    {f.estado==="ok"
                      ? <span style={{ display:"inline-flex", alignItems:"center", gap:4,
                          background:DS.greenL, color:DS.green, padding:"2px 8px",
                          borderRadius:4, fontFamily:DS.sans, fontSize:10, fontWeight:700 }}>✓ OK</span>
                      : <span style={{ display:"inline-flex", alignItems:"center", gap:4,
                          background:DS.amberL, color:DS.amber, padding:"2px 8px",
                          borderRadius:4, fontFamily:DS.sans, fontSize:10, fontWeight:700 }}>⚠ Revisar</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── PANTALLA: CONFIGURACIÓN ──────────────────────────────────────────────────
function PantallaConfig({ showToast }) {
  const [umbral,      setUmbral]      = useState(65);
  const [slaDefault,  setSla]         = useState(48);
  const [notifSlack,  setSlack]       = useState(true);
  const [notifEmail,  setEmail]       = useState(true);
  const [retro,       setRetro]       = useState(true);

  const Toggle = ({ val, set, label }) => (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <button onClick={()=>set(!val)}
        style={{ width:44, height:24, borderRadius:12, border:"none",
          background:val?DS.green:DS.slateXL, cursor:"pointer", position:"relative",
          transition:"background .2s", flexShrink:0 }}>
        <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff",
          position:"absolute", top:3, left:val?23:3, transition:"left .2s" }}/>
      </button>
      <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink }}>{label}</span>
    </div>
  );

  const CONEXIONES = [
    { nombre:"Supabase (PostgreSQL + pgvector)", estado:"ok", detalle:"kwyicmnbquqpuoxmsxgt.supabase.co · São Paulo · Realtime activo" },
    { nombre:"n8n (Orquestador)",               estado:"ok", detalle:"n8n.srv1108143.hstgr.cloud · Hostinger VPS 8GB · A0–A7 activos" },
    { nombre:"Clerk (Autenticación)",           estado:"warn",detalle:"Development mode activo — pendiente activar producción" },
    { nombre:"Slack (Notificaciones HITL)",     estado:"ok", detalle:"pyme-en-regla.slack.com · 7 canales activos" },
    { nombre:"Gmail (Confirmaciones)",          estado:"ok", detalle:"OAuth2 per-n8n-496803 · Envíos automáticos activos" },
    { nombre:"OpenAI (Embeddings)",             estado:"ok", detalle:"text-embedding-3-small · Vectorización activa" },
    { nombre:"Claude (Agentes IA)",             estado:"ok", detalle:"claude-haiku (A0) · claude-sonnet (A1–A7)" },
  ];

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>Configuración</h1>
      <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:"0 0 24px" }}>
        Parámetros del sistema, usuarios y conexiones
      </p>

      {/* Parámetros */}
      <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10,
        padding:"20px 24px", marginBottom:20 }}>
        <SectionLabel icon="⚙">Parámetros del sistema</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
          <div>
            <label style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700, color:DS.slateL,
              textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>
              Umbral HITL (confianza mínima)
            </label>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <input type="range" min={30} max={95} value={umbral}
                onChange={e=>setUmbral(Number(e.target.value))}
                style={{ flex:1, accentColor:DS.gold }}/>
              <span style={{ fontFamily:DS.serif, fontSize:22, fontWeight:700, color:DS.ink, minWidth:42 }}>
                {umbral}%
              </span>
            </div>
          </div>
          <div>
            <label style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700, color:DS.slateL,
              textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>
              SLA por defecto (horas)
            </label>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <input type="range" min={6} max={120} step={6} value={slaDefault}
                onChange={e=>setSla(Number(e.target.value))}
                style={{ flex:1, accentColor:DS.gold }}/>
              <span style={{ fontFamily:DS.serif, fontSize:22, fontWeight:700, color:DS.ink, minWidth:42 }}>
                {slaDefault}h
              </span>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:24, marginBottom:20, flexWrap:"wrap" }}>
          <Toggle val={notifSlack} set={setSlack} label="Notificaciones Slack HITL"/>
          <Toggle val={notifEmail} set={setEmail} label="Notificaciones Email cliente"/>
          <Toggle val={retro}      set={setRetro} label="Retro-RAG automático al cerrar"/>
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button onClick={()=>showToast("Configuración guardada ✓","ok")}
            style={{ padding:"9px 22px", borderRadius:7, border:"none", background:DS.ink,
              cursor:"pointer", fontFamily:DS.sans, fontSize:13, fontWeight:700, color:DS.gold }}>
            Guardar cambios
          </button>
        </div>
      </div>

      {/* Atajos de teclado */}
      <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10,
        padding:"20px 24px", marginBottom:20 }}>
        <SectionLabel icon="◧">Atajos de teclado</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
          {[
            ["⌘K","Buscar y navegar (Command Palette)"],
            ["N","Nuevo caso"],
            ["1–8","Cambiar sección"],
            ["J / K","Navegar lista de casos"],
            ["A","Aprobar caso seleccionado"],
            ["E","Escalar caso"],
            ["R","Rechazar / devolver a HITL"],
            ["I","Solicitar información al cliente"],
            ["F","Modo enfoque (oculta la lista)"],
            ["esc","Salir / cerrar modal"],
          ].map(([k,l]) => (
            <div key={k} style={{ display:"flex", alignItems:"center", gap:10,
              padding:"8px 12px", background:DS.bg, borderRadius:7 }}>
              <Kbd>{k}</Kbd>
              <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Conexiones */}
      <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${DS.border}` }}>
          <SectionLabel icon="◈">Conexiones del sistema</SectionLabel>
        </div>
        <div style={{ display:"flex", flexDirection:"column" }}>
          {CONEXIONES.map((c,i) => (
            <div key={c.nombre} style={{ padding:"12px 20px",
              borderBottom: i<CONEXIONES.length-1 ? `1px solid ${DS.border}` : "none",
              background: c.estado==="warn" ? DS.amberXL : "transparent",
              display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:7, height:7, borderRadius:"50%",
                background: c.estado==="ok" ? DS.green : DS.amber,
                boxShadow:`0 0 5px ${c.estado==="ok"?DS.green:DS.amber}`, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink }}>{c.nombre}</div>
                <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{c.detalle}</div>
              </div>
              <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700,
                color: c.estado==="ok" ? DS.green : DS.amber,
                background: c.estado==="ok" ? DS.greenL : DS.amberL,
                padding:"3px 8px", borderRadius:4 }}>
                {c.estado==="ok" ? "Conectado" : "Pendiente"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PANTALLA DE LOGIN ────────────────────────────────────────────────────────
function LoginScreen() {
  return (
    <div style={{ display:"flex", height:"100vh", alignItems:"center", justifyContent:"center",
      background:DS.bgSide, flexDirection:"column", gap:24 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
        <div style={{ width:48, height:48, background:"rgba(184,148,58,0.15)", borderRadius:10,
          display:"flex", alignItems:"center", justifyContent:"center",
          border:`1.5px solid ${DS.goldDim}` }}>
          <span style={{ fontFamily:DS.serif, fontSize:26, fontWeight:700, color:DS.gold }}>P</span>
        </div>
        <div>
          <div style={{ fontFamily:DS.serif, fontSize:22, fontWeight:700, color:"#FDFBF8" }}>
            Pyme En Regla
          </div>
          <div style={{ fontFamily:DS.sans, fontSize:10, color:"rgba(255,255,255,0.3)",
            letterSpacing:"0.12em", textTransform:"uppercase" }}>Panel Interno</div>
        </div>
      </div>
      <SignIn />
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function PERApp() {
  const [nav,           setNav]           = useState("home");
  const [toast,         setToast]         = useState(null);
  const [modalNuevo,    setModalNuevo]    = useState(false);
  const [collapsed,     setCollapsed]     = useState(false);
  const [cmdOpen,       setCmdOpen]       = useState(false);
  const [selIdExterno,  setSelIdExterno]  = useState(null);
  const [sesion,        setSesion]        = useState({ aprobados:0, escalados:0, rechazados:0 });

  // Motor Supabase
  const {
    casos, loading, error, lastUpdate, fetchCasos,
    actualizarEstado, actualizarNota, actualizarDatos, eliminarCaso, cerrarCaso,
  } = useCasosSupabase();

  // Plazos Supabase
  const { plazos, loading:loadingPlazos, marcarGestionado } = usePlazosSupabase();

  // Estado real de agentes desde Supabase
  const agentesStatus = useAgentesStatus();

  // Fuentes
  useEffect(() => {
    // Google Fonts — Cormorant Garamond + Outfit + JetBrains Mono
    if (!document.getElementById("per-fonts")) {
      const l = document.createElement("link");
      l.id = "per-fonts";
      l.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap";
      l.rel  = "stylesheet";
      document.head.appendChild(l);
    }
  }, []);

  // Atajos globales
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k") {
        e.preventDefault(); setCmdOpen(o=>!o); return;
      }
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if (cmdOpen||modalNuevo) return;
      const navMap = {
        "1":"home","2":"hitl","3":"casos","4":"plazos",
        "5":"clientes","6":"metricas","7":"sistema","8":"rag",
      };
      if (navMap[e.key]) { e.preventDefault(); setNav(navMap[e.key]); }
      if (e.key.toLowerCase()==="n") { e.preventDefault(); setModalNuevo(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdOpen, modalNuevo]);

  function showToast(msg, tipo="ok", onUndo=null) {
    setToast({ msg, tipo, onUndo });
    setTimeout(() => setToast(t => (t&&t.msg===msg?null:t)), onUndo ? 6000 : 3400);
  }

  async function handleNuevoCaso(form) {
    const folio = "PER-" + Math.random().toString(36).substr(2,8).toUpperCase();
    const { error: e } = await supabase.from("casos").insert({
      folio,
      contacto_nombre:  form.nombre,
      cliente_empresa:  form.empresa,
      cliente_rut:      form.rut_empresa || "Sin RUT",
      contacto_email:   form.email,
      contacto_tel:     form.telefono,
      area:             form.area,
      kit:              form.kit,
      canal:            form.urgencia==="urgente"?"presencial":"presencial",
      prioridad:        form.urgencia==="urgente"?"ALTA":"MEDIA",
      asunto:           form.consulta.substring(0,120),
      consulta_raw:     form.consulta,
      estado:           "HITL",
      sla_horas:        form.urgencia==="urgente"?12:48,
      retro_enviado:    false,
      borrador_aprobado:false,
      ingresado_at:     new Date().toISOString(),
    });
    if (e) { showToast("Error al crear caso","err"); return; }
    showToast(`Caso ${folio} creado → Cola HITL ✓`,"ok");
    setModalNuevo(false);
    setNav("hitl");
    await fetchCasos();
  }

  const hitlCount   = casos.filter(c=>c.estado==="HITL"||c.estado==="ESCALADO").length;
  const plazosCount = plazos.filter(p=>p.dias<=3&&!p.gestionado).length;

  // Pantalla de dashboard
  const dashboard = (
    <div style={{ display:"flex", height:"100vh", background:DS.bg,
      fontFamily:DS.sans, overflow:"hidden", position:"relative" }}>
      <style>{`
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${DS.slateXL}; border-radius:3px; }
        @keyframes slideIn { from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes cmdIn { from{transform:scale(.97) translateY(-6px);opacity:0}to{transform:scale(1) translateY(0);opacity:1} }
        @keyframes fadeUp { from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1} }
        @media (prefers-reduced-motion:reduce) {
          *,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}
        }
      `}</style>

      <Toast toast={toast} clear={()=>setToast(null)}/>
      <CommandPalette open={cmdOpen} onClose={()=>setCmdOpen(false)}
        casos={casos} setNav={setNav} selectCaso={id=>setSelIdExterno(id)}/>
      {modalNuevo && <ModalNuevoCaso onSave={handleNuevoCaso} onClose={()=>setModalNuevo(false)}/>}

      <Sidebar nav={nav} setNav={setNav} hitlCount={hitlCount} plazosCount={plazosCount}
        agentesErr={agentesStatus.filter(a=>a.estado!=="ok").length}
        collapsed={collapsed} setCollapsed={setCollapsed}
        onCmd={()=>setCmdOpen(true)} lastUpdate={lastUpdate}/>

      <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", minWidth:0 }}>
        <TopBar nav={nav} casos={casos} onNuevoCaso={()=>setModalNuevo(true)}
          sesion={sesion} onRefresh={fetchCasos}/>
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

          {/* Loading state */}
          {loading && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", gap:12, background:DS.bg }}>
              <div style={{ width:44, height:44, borderRadius:10, background:DS.ink,
                display:"flex", alignItems:"center", justifyContent:"center",
                border:`1px solid ${DS.goldLine}` }}>
                <span style={{ fontFamily:DS.serif, fontSize:24, fontWeight:700,
                  color:DS.gold, display:"inline-block", animation:"spin 2s linear infinite" }}>P</span>
              </div>
              <div style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL }}>
                Conectando con Supabase…
              </div>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", gap:12 }}>
              <span style={{ fontSize:40, color:DS.red }}>⚠</span>
              <div style={{ fontFamily:DS.sans, fontSize:13, color:DS.slate,
                maxWidth:320, textAlign:"center" }}>{error}</div>
              <button onClick={fetchCasos}
                style={{ padding:"10px 20px", borderRadius:7, border:"none",
                  background:DS.ink, cursor:"pointer", fontFamily:DS.sans,
                  fontSize:13, fontWeight:700, color:DS.gold }}>Reintentar</button>
            </div>
          )}

          {/* Screens */}
          {!loading && !error && nav==="home"     && <PantallaHome casos={casos} plazos={plazos} setNav={setNav} agentesStatus={agentesStatus}/>}
          {!loading && !error && nav==="hitl"     && (
            <PantallaCasos casos={casos} actualizarEstado={actualizarEstado}
              actualizarNota={actualizarNota} actualizarDatos={actualizarDatos}
              eliminarCaso={eliminarCaso} cerrarCaso={cerrarCaso}
              showToast={showToast} soloHITL={true}
              sesion={sesion} setSesion={setSesion}
              selIdExterno={selIdExterno} setSelIdExterno={setSelIdExterno}/>
          )}
          {!loading && !error && nav==="casos"    && (
            <PantallaCasos casos={casos} actualizarEstado={actualizarEstado}
              actualizarNota={actualizarNota} actualizarDatos={actualizarDatos}
              eliminarCaso={eliminarCaso} cerrarCaso={cerrarCaso}
              showToast={showToast}
              sesion={sesion} setSesion={setSesion}
              selIdExterno={selIdExterno} setSelIdExterno={setSelIdExterno}/>
          )}
          {!loading && !error && nav==="plazos"   && (
            <PantallaPlazos plazos={plazos} loading={loadingPlazos} marcarGestionado={marcarGestionado}/>
          )}
          {!loading && !error && nav==="clientes" && <PantallaClientes casos={casos}/>}
          {!loading && !error && nav==="metricas" && <PantallaMetricas casos={casos}/>}
          {!loading && !error && nav==="sistema"  && <PantallaSystem agentesStatus={agentesStatus}/>}
          {!loading && !error && nav==="rag"      && <PantallaRAG/>}
          {!loading && !error && nav==="config"   && <PantallaConfig showToast={showToast}/>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SignedOut><LoginScreen/></SignedOut>
      <SignedIn>{dashboard}</SignedIn>
    </>
  );
}

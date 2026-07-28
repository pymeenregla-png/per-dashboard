// ═══════════════════════════════════════════════════════════════════════════════
//  PER — Panel Interno v4
//  Cinco secciones. Nada más, nada menos.
//  Hoy: qué necesita mi atención. Revisar: decidir rápido. Casos: encontrar.
//  Agenda: que nada venza. Sistema: la verdad sobre los agentes.
//  Todo lo que se muestra es real. Lo que no era real, se eliminó.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo, Component } from "react";
import { SignIn, SignedIn, SignedOut, useClerk } from "@clerk/clerk-react";
import { supabase } from "./lib/supabase";

// ─── WEBHOOKS n8n ─────────────────────────────────────────────────────────────
const WH = {
  procesar: "https://n8n.srv1108143.hstgr.cloud/webhook/per-procesar-caso",
  aprobar:  "https://n8n.srv1108143.hstgr.cloud/webhook/per-aprobar",
  escalar:  "https://n8n.srv1108143.hstgr.cloud/webhook/per-escalar",
  cerrar:   "https://n8n.srv1108143.hstgr.cloud/webhook/per-cerrar",
  info:     "https://n8n.srv1108143.hstgr.cloud/webhook/per-solicitar-info",
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
  ink:"#0C1B2E", inkM:"#1F3A5F",
  slate:"#5A6B7E", slateL:"#8A9BAE", slateXL:"#C4D0DC",
  gold:"#B8943A", goldFaint:"rgba(184,148,58,0.09)",
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
  HITL:        { label:"Pendiente",   dot:DS.amber, bg:DS.amberL, txt:DS.amber },
  EN_REVISION: { label:"En proceso",  dot:DS.blue,  bg:DS.blueL,  txt:DS.blue },
  ESCALADO:    { label:"Escalado",    dot:DS.red,   bg:DS.redL,   txt:DS.red },
  CERRADO:     { label:"Cerrado",     dot:DS.green, bg:DS.greenL, txt:DS.green },
  PENDIENTE:   { label:"Nuevo",       dot:DS.slate, bg:DS.border, txt:DS.slate },
  PROCESANDO:  { label:"Procesando…", dot:DS.purple,bg:DS.purpleL,txt:DS.purple },
};
const AGENTES_BASE = [
  { id:"A0", nombre:"Intake & Routing"  },
  { id:"A1", nombre:"Contratos"         },
  { id:"A2", nombre:"Marcas INAPI"      },
  { id:"A3", nombre:"Laboral DT"        },
  { id:"A4", nombre:"Tributario SII"    },
  { id:"A5", nombre:"Societario"        },
  { id:"A6", nombre:"Consumidor SERNAC" },
  { id:"A7", nombre:"Cobranza"          },
];

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
// Convierte cualquier formato (JSONB array, string JSON, texto plano) en lista limpia
function toList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s === "[]") return [];
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p.filter(Boolean) : [String(p)];
    } catch {
      return s.split(/\n|;(?!\d)/).map(x => x.trim()).filter(Boolean);
    }
  }
  return [v];
}

// ─── MAPEADOR SUPABASE → MODELO INTERNO ──────────────────────────────────────
// Une la fila de casos con su análisis tipado más reciente de analisis_agente.
// Si el análisis tipado existe, es la fuente de verdad. Si no, cae a los
// campos legacy de casos. El dashboard nunca inventa datos.
function mapCaso(row) {
  const horas = horasDesde(row.ingresado_at || row.created_at);

  // Análisis tipado más reciente (join con analisis_agente)
  const analisisRows = Array.isArray(row.analisis_agente) ? row.analisis_agente : [];
  const tipado = analisisRows.length
    ? [...analisisRows].sort((a,b) => new Date(b.procesado_en) - new Date(a.procesado_en))[0]
    : null;

  const confianza = tipado?.confianza != null
    ? parseFloat(tipado.confianza)
    : (parseFloat(row.confianza_ia) || 0);

  const resumen  = tipado?.resumen  || row.resumen_ia || "";
  const acciones = toList(tipado?.acciones).length ? toList(tipado.acciones) : toList(row.acciones_pendientes);
  const riesgos  = toList(tipado?.riesgos);
  const plazosIA = toList(tipado?.plazos);
  const fuentes  = toList(tipado?.rag_docs_usados).length ? toList(tipado.rag_docs_usados) : toList(row.fuentes_rag);
  const escalar  = tipado ? !!tipado.escalar : false;

  // Nivel de riesgo derivado de señales reales (no existe columna riesgo)
  const nivelRiesgo = escalar || confianza < 0.5 ? "alto" : confianza < 0.7 ? "medio" : "bajo";

  const historial = [
    {
      ts:    row.ingresado_at || row.created_at,
      actor: "Sistema",
      tipo:  "sistema",
      msg:   `Caso ingresado vía ${row.canal || "web"}. Folio ${row.folio || row.id}.`,
    },
    ...(tipado ? [{
      ts:    tipado.procesado_en,
      actor: `Agente ${tipado.agente}`,
      tipo:  "ia",
      msg:   `Análisis tipado completado. Confianza ${Math.round(confianza * 100)}%.${escalar ? " Recomienda escalar." : ""}`,
    }] : resumen ? [{
      ts:    row.ultima_accion_at || row.ingresado_at,
      actor: `Agente ${row.agente_id || "IA"}`,
      tipo:  "ia",
      msg:   `Análisis completado. Confianza ${Math.round(confianza * 100)}%.`,
    }] : []),
    ...(row.cerrado_at ? [{
      ts:    row.cerrado_at,
      actor: "Abogado",
      tipo:  "abogado",
      msg:   "Caso cerrado." + (row.leccion_aprendida ? " Lección registrada para el RAG." : ""),
    }] : []),
  ];

  return {
    id:    row.folio || row.id,
    uuid:  row.id,
    estado:    row.estado    || "PENDIENTE",
    prioridad: row.prioridad || "MEDIA",
    agente:    tipado?.agente || row.agente_id || "A0",
    canal:     row.canal     || "Web",
    kit:       row.kit       || "—",
    area:      tipado?.area_legal || row.area || "Otro",
    ingreso:             row.ingresado_at || row.created_at,
    horas_transcurridas: horas,
    sla_horas:           parseInt(row.sla_horas) || 48,
    cliente: {
      nombre:   row.contacto_nombre || "—",
      empresa:  row.cliente_empresa || "—",
      rut:      row.cliente_rut     || "—",
      email:    row.contacto_email  || "—",
      telefono: row.contacto_tel    || "—",
    },
    asunto:       row.asunto || "Sin asunto",
    consulta_raw: row.consulta_raw || row.asunto || "",
    analisis: {
      tipado:         !!tipado,
      resumen,
      confianza,
      criterio:       tipado?.criterio_conf || "",
      riesgo:         nivelRiesgo,
      riesgos,
      acciones,
      plazos:         plazosIA,
      escalar,
      motivo_escalar: tipado?.motivo_escalar || "",
      fuentes,
      prompt_version: tipado?.prompt_version || "",
    },
    plazo_critico:     row.plazo_critico     || null,
    plazo_descripcion: row.plazo_descripcion || "",
    drive_url:         row.drive_url         || null,
    nota_abogado:      row.nota_abogado      || "",
    leccion:           row.leccion_aprendida || "",
    historial,
  };
}

// ─── HOOK: CASOS + ANALISIS TIPADO ────────────────────────────────────────────
function useCasosSupabase() {
  const [casos,      setCasos]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchCasos = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("casos")
        .select("*, analisis_agente(*)")
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
      .on("postgres_changes", { event:"*", schema:"public", table:"analisis_agente" }, fetchCasos)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchCasos]);

  const actualizarEstado = useCallback(async (uuid, estado) => {
    const now = new Date().toISOString();
    const patch = { estado, ultima_accion_at: now };
    if (estado === "CERRADO") patch.cerrado_at = now;   // verdad de cierre
    const { error: e } = await supabase
      .from("casos")
      .update(patch)
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
        contacto_nombre:  form.nombre,
        contacto_email:   form.email,
        contacto_tel:     form.tel,
        cliente_rut:      form.rut,
        cliente_empresa:  form.empresa,
        asunto:           form.asunto,
        ultima_accion_at: new Date().toISOString(),
      })
      .eq("id", uuid);
    if (!e) setCasos(p => p.map(c => c.uuid === uuid
      ? { ...c, asunto: form.asunto,
          cliente: { ...c.cliente, nombre: form.nombre, email: form.email,
            telefono: form.tel, rut: form.rut, empresa: form.empresa } }
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
        estado:            "CERRADO",
        leccion_aprendida: leccion,
        cerrado_at:        new Date().toISOString(),
        retro_enviado:     false,
        ultima_accion_at:  new Date().toISOString(),
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

// ─── HOOK: PLAZOS ─────────────────────────────────────────────────────────────
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
          id:         p.id,
          caso_id:    p.caso_id || null,
          tipo:       p.tipo    || "General",
          cliente:    p.asunto?.split("—")[0]?.trim() || "Cliente",
          asunto:     p.asunto  || "Sin asunto",
          fecha:      p.fecha_vence,
          dias,
          gestionado: p.estado === "cumplido" || p.estado === "gestionado",
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

  return { plazos, loading, marcarGestionado };
}

// ─── HOOK: SALUD REAL DE AGENTES ─────────────────────────────────────────────
// Dos verdades separadas, sin inventar nada:
//   OPERATIVO → ¿corre? (última ejecución real en analisis_agente.procesado_en)
//   CALIDAD   → ¿responde bien? (confianza promedio + tasa de escalación)
// Un agente puede estar vivo con mala calidad, o dormido aunque su última
// corrida fuera buena. El panel muestra ambas cosas por separado.
const AREA_A_AGENTE = {
  Contratos:"A1", Marcas:"A2", Laboral:"A3", Tributario:"A4",
  Societario:"A5", Consumidor:"A6", Cobranza:"A7", Orientacion:"A0", Otro:"A0",
};
const HORAS_DORMIDO = 72; // 3 días sin correr teniendo cola = alerta

function useAgentesStatus() {
  const [agentes, setAgentes] = useState(
    AGENTES_BASE.map(a => ({
      ...a, estado:"ok", operativo:"sin_datos", salud:"sin_datos",
      conf_prom:null, casos_total:0, escalados:0, tipados:0,
      ultimo_run:null, horas_desde_run:null, pendientes_area:0,
    }))
  );

  const fetchAgentes = useCallback(async () => {
    try {
      const [casosRes, tipadosRes] = await Promise.all([
        supabase.from("casos").select("agente_id, area, confianza_ia, estado"),
        supabase.from("analisis_agente").select("agente, confianza, escalar, procesado_en"),
      ]);
      const casosData   = casosRes.data   || [];
      const tipadosData = tipadosRes.data || [];

      // Cola pendiente por agente (casos HITL/ESCALADO mapeados por área)
      const pend = {};
      casosData.forEach(c => {
        if (c.estado === "HITL" || c.estado === "ESCALADO") {
          const ag = AREA_A_AGENTE[c.area] || "A0";
          pend[ag] = (pend[ag] || 0) + 1;
        }
      });

      // Volumen + calidad por agente (desde casos)
      const mapa = {};
      const push = id => (mapa[id] ||= { conf_sum:0, conf_count:0, escalados:0, total:0, tipados:0, ultimo:null });
      casosData.forEach(c => {
        if (!c.agente_id) return;
        const m = push(c.agente_id);
        m.total++;
        if (c.confianza_ia != null) { m.conf_sum += parseFloat(c.confianza_ia); m.conf_count++; }
        if (c.estado === "ESCALADO") m.escalados++;
      });

      // Última corrida REAL + conteo de análisis tipados (desde analisis_agente)
      tipadosData.forEach(t => {
        if (!t.agente) return;
        const m = push(t.agente);
        m.tipados++;
        const ts = t.procesado_en ? new Date(t.procesado_en) : null;
        if (ts && (!m.ultimo || ts > m.ultimo)) m.ultimo = ts;
      });

      setAgentes(AGENTES_BASE.map(base => {
        const m = mapa[base.id] || {};
        const pendientes = pend[base.id] || 0;
        const conf = m.conf_count > 0 ? m.conf_sum / m.conf_count : null;
        const tasa = m.total > 0 ? m.escalados / m.total : 0;
        const horasRun = m.ultimo ? Math.floor((Date.now() - m.ultimo.getTime()) / 3600000) : null;

        // OPERATIVO: ¿corrió alguna vez? ¿dormido con cola?
        let operativo;
        if (m.ultimo == null)                              operativo = pendientes > 0 ? "sin_correr" : "sin_datos";
        else if (horasRun >= HORAS_DORMIDO && pendientes)  operativo = "dormido";
        else                                               operativo = "vivo";

        // CALIDAD: solo si hay confianza medida
        let salud;
        if (conf == null)                    salud = "sin_datos";
        else if (conf < 0.45 || tasa > 0.30) salud = "critico";
        else if (conf < 0.65)                salud = "atencion";
        else                                 salud = "sano";

        // estado derivado (compatibilidad con sistemaAlerta del root)
        const estado =
          (salud === "critico" || operativo === "dormido" || operativo === "sin_correr") ? "err"
          : salud === "atencion" ? "warn" : "ok";

        return {
          ...base, estado, operativo, salud,
          conf_prom:   conf ? parseFloat(conf.toFixed(2)) : null,
          casos_total: m.total || 0,
          escalados:   m.escalados || 0,
          tipados:     m.tipados || 0,
          ultimo_run:  m.ultimo ? m.ultimo.toISOString() : null,
          horas_desde_run: horasRun,
          pendientes_area: pendientes,
        };
      }));
    } catch (e) {
      console.error("useAgentesStatus:", e);
    }
  }, []);

  useEffect(() => {
    fetchAgentes();
    const interval = setInterval(fetchAgentes, 120000);
    return () => clearInterval(interval);
  }, [fetchAgentes]);

  return agentes;
}

// ─── SUGERENCIA DEL SISTEMA ───────────────────────────────────────────────────
// El sistema sugiere. El abogado decide. Siempre.
function accionSugerida(caso) {
  const c = caso.analisis.confianza;
  if (caso.analisis.escalar || (c > 0 && c < 0.5))
    return { accion:"escalar", motivo: caso.analisis.motivo_escalar || "Confianza baja" };
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
    { tipo:"nav", id:"hoy",     label:"Ir a Hoy",     icon:"⌂" },
    { tipo:"nav", id:"revisar", label:"Ir a Revisar", icon:"◎" },
    { tipo:"nav", id:"casos",   label:"Ir a Casos",   icon:"☰" },
    { tipo:"nav", id:"agenda",  label:"Ir a Agenda",  icon:"◷" },
    { tipo:"nav", id:"sistema", label:"Ir a Sistema", icon:"⚙" },
    { tipo:"nav", id:"clientes",label:"Ir a Clientes",icon:"◈" },
  ];

  const results = useMemo(() => {
    const query = q.toLowerCase().trim();
    if (!query) return navItems;
    const navs = navItems.filter(n => n.label.toLowerCase().includes(query));
    const cs = casos
      .filter(c =>
        c.cliente.empresa.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query) ||
        c.asunto.toLowerCase().includes(query) ||
        c.analisis.resumen.toLowerCase().includes(query) ||
        c.cliente.nombre.toLowerCase().includes(query)
      )
      .slice(0, 6)
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
            onKeyDown={handleKey} placeholder="Buscar caso, empresa o sección…"
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
      </div>
    </div>
  );
}

// ─── MODAL: NUEVO CASO ────────────────────────────────────────────────────────
function ModalNuevoCaso({ onSave, onClose }) {
  const [form, setForm] = useState({
    nombre:"", empresa:"", rut_empresa:"", email:"", telefono:"",
    area:"Laboral", urgencia:"normal", consulta:"", kit:"Arranque",
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
              Paso {step} de 2 — {step===1 ? "Cliente" : "Consulta"}
            </div>
          </div>
          <button onClick={onClose} style={{ border:"none", background:"transparent",
            cursor:"pointer", fontSize:18, color:DS.slateL, padding:4 }}>✕</button>
        </div>
        <div style={{ padding:"20px 24px" }}>
          {step === 1 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>Nombre contacto *</label>
                  <input value={form.nombre} onChange={e=>upd("nombre",e.target.value)} style={inp}
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
                <div><label style={lbl}>Empresa *</label>
                  <input value={form.empresa} onChange={e=>upd("empresa",e.target.value)} style={inp}
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>RUT empresa</label>
                  <input value={form.rut_empresa} onChange={e=>upd("rut_empresa",e.target.value)} style={inp}
                    placeholder="76.444.321-5"
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
                <div><label style={lbl}>Teléfono</label>
                  <input value={form.telefono} onChange={e=>upd("telefono",e.target.value)} style={inp}
                    placeholder="+56 9 XXXX XXXX"
                    onFocus={e=>e.target.style.borderColor=DS.gold}
                    onBlur={e=>e.target.style.borderColor=DS.border}/></div>
              </div>
              <div><label style={lbl}>Email *</label>
                <input type="email" value={form.email} onChange={e=>upd("email",e.target.value)} style={inp}
                  placeholder="contacto@empresa.cl"
                  onFocus={e=>e.target.style.borderColor=DS.gold}
                  onBlur={e=>e.target.style.borderColor=DS.border}/></div>
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
              <div><label style={lbl}>Kit</label>
                <select value={form.kit} onChange={e=>upd("kit",e.target.value)}
                  style={{ ...inp, cursor:"pointer" }}>
                  {["Arranque","Compliance","Premium","Retainer"].map(k=><option key={k}>{k}</option>)}
                </select></div>
              <div><label style={lbl}>Descripción de la consulta *</label>
                <textarea value={form.consulta} onChange={e=>upd("consulta",e.target.value)}
                  placeholder="Situación, fechas relevantes, partes involucradas, qué quiere resolver el cliente…"
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

// ─── MODAL: EDITAR ────────────────────────────────────────────────────────────
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
          <span style={{ fontFamily:DS.serif, fontSize:18, fontWeight:700, color:DS.ink }}>Editar caso</span>
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
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: ELIMINAR ──────────────────────────────────────────────────────────
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
            Acción <strong>irreversible</strong>. El caso <strong>{caso.id}</strong> de{" "}
            <strong>{caso.cliente.empresa}</strong> se elimina permanentemente.
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
            {saving ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR — 5 SECCIONES ────────────────────────────────────────────────────
function Sidebar({ nav, setNav, revisarCount, agendaCount, sistemaAlerta, collapsed, setCollapsed, onCmd, lastUpdate }) {
  const { signOut } = useClerk();
  const items = [
    { id:"hoy",     icon:"⌂", label:"Hoy",     kbd:"1" },
    { id:"revisar", icon:"◎", label:"Revisar", kbd:"2", badge:revisarCount, badgeColor:DS.amber },
    { id:"casos",   icon:"☰", label:"Casos",   kbd:"3" },
    { id:"agenda",  icon:"◷", label:"Agenda",  kbd:"4", badge:agendaCount, badgeColor:DS.red },
    { id:"sistema", icon:"⚙", label:"Sistema", kbd:"5", dot: sistemaAlerta ? DS.red : null },
  ];

  return (
    <div style={{ width: collapsed ? 56 : 216, background:DS.bgSide, display:"flex",
      flexDirection:"column", flexShrink:0, height:"100vh",
      transition:"width .2s ease", overflow:"hidden" }}>
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
      <div style={{ flex:1, paddingTop:6, overflowY:"auto" }}>
        {items.map(it => {
          const active = nav === it.id;
          return (
            <button key={it.id} onClick={()=>setNav(it.id)} title={collapsed ? it.label : undefined}
              style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
                padding: collapsed ? "12px 0" : "11px 18px",
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
        {!collapsed && <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"8px 18px" }}/>}
        <button onClick={()=>setNav("clientes")} title={collapsed ? "Clientes" : undefined}
          style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
            padding: collapsed ? "12px 0" : "11px 18px",
            justifyContent: collapsed ? "center" : "flex-start",
            background: nav==="clientes" ? "rgba(184,148,58,0.13)" : "transparent",
            border:"none", borderLeft:`2px solid ${nav==="clientes" ? DS.gold : "transparent"}`,
            cursor:"pointer", transition:"all .12s" }}
          onMouseEnter={e=>{ if(nav!=="clientes") e.currentTarget.style.background="rgba(255,255,255,0.05)"; }}
          onMouseLeave={e=>{ if(nav!=="clientes") e.currentTarget.style.background="transparent"; }}>
          <span style={{ fontSize:15, color: nav==="clientes" ? DS.gold : "rgba(255,255,255,0.4)", flexShrink:0 }}>◈</span>
          {!collapsed && (
            <span style={{ fontFamily:DS.sans, fontSize:13, fontWeight: nav==="clientes" ? 600 : 400,
              color: nav==="clientes" ? DS.gold : "rgba(255,255,255,0.6)", flex:1, textAlign:"left" }}>Clientes</span>
          )}
        </button>
      </div>
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
      <div style={{ padding: collapsed ? "12px 0" : "12px 18px",
        borderTop:"1px solid rgba(255,255,255,0.06)",
        display:"flex", flexDirection: collapsed ? "column" : "row",
        alignItems:"center", gap:10, justifyContent:"flex-start" }}>
        <div style={{ width:30, height:30, borderRadius:"50%", background:"rgba(184,148,58,0.15)",
          border:`1px solid ${DS.goldDim}`, display:"flex", alignItems:"center",
          justifyContent:"center", flexShrink:0 }}>
          <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:800, color:DS.gold }}>KL</span>
        </div>
        {!collapsed && (
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:DS.sans, fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.75)" }}>Kurt Leupin</div>
            <div style={{ fontFamily:DS.sans, fontSize:9, color:"rgba(255,255,255,0.3)" }}>Abogado · Admin</div>
          </div>
        )}
        <button onClick={()=>signOut()} title="Cerrar sesión"
          style={{ border:"none", background:"rgba(255,255,255,0.06)", cursor:"pointer",
            borderRadius:6, padding:"6px 8px", color:"rgba(255,255,255,0.45)", fontSize:13,
            flexShrink:0, transition:"all .12s" }}
          onMouseEnter={e=>{ e.currentTarget.style.background="rgba(139,30,30,0.45)"; e.currentTarget.style.color="#fff"; }}
          onMouseLeave={e=>{ e.currentTarget.style.background="rgba(255,255,255,0.06)"; e.currentTarget.style.color="rgba(255,255,255,0.45)"; }}>⏻</button>
      </div>
    </div>
  );
}

// ─── TOPBAR ───────────────────────────────────────────────────────────────────
function TopBar({ nav, sesion, onNuevoCaso, onRefresh }) {
  const [sync, setSync] = useState(false);
  const titles = {
    hoy:"Hoy", revisar:"Revisar — Cola de decisión", casos:"Casos",
    agenda:"Agenda Legal", sistema:"Sistema",
  };
  const revisados = sesion.aprobados + sesion.escalados + sesion.rechazados;

  return (
    <div style={{ height:52, background:DS.bgCard, borderBottom:`1px solid ${DS.border}`,
      display:"flex", alignItems:"center", padding:"0 24px",
      justifyContent:"space-between", flexShrink:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <span style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.slate }}>
          {titles[nav] || "Panel PER"}
        </span>
        {revisados > 0 && (
          <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL,
            background:DS.bg, padding:"4px 10px", borderRadius:12 }}>
            Sesión: {revisados} revisado{revisados!==1?"s":""}
          </span>
        )}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={async()=>{ if(sync) return; setSync(true); try { await onRefresh(); } finally { setTimeout(()=>setSync(false), 500); } }}
          style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 11px",
            background:"transparent", borderRadius:6, border:`1px solid ${DS.border}`,
            cursor:"pointer", transition:"all .12s" }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor=DS.green; }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor=DS.border; }}>
          <span style={{ fontSize:12, color:DS.green, display:"inline-block",
            animation: sync ? "spin 0.8s linear infinite" : "none" }}>↻</span>
          <span style={{ fontFamily:DS.sans, fontSize:11, fontWeight:600, color:DS.slate }}>{sync ? "Sincronizando…" : "Sincronizar"}</span>
        </button>
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
              ✦ {sug.accion}
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
  const rColor  = caso.analisis.riesgo==="alto"?DS.red:caso.analisis.riesgo==="medio"?DS.amber:DS.green;
  const sug     = !cerrado ? accionSugerida(caso) : null;

  const TABS = [
    { id:"analisis", label:"Análisis" },
    { id:"consulta", label:"Consulta" },
    { id:"historial",label:"Historial" },
    { id:"cierre",   label:"Cierre", hidden:cerrado },
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
              {caso.analisis.tipado && (
                <Badge label={`Análisis tipado ${caso.analisis.prompt_version||""}`} color={DS.purple} bg={DS.purpleL} size={9}/>
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
                    <button onClick={()=>setFocus(f=>!f)} title={focus?"Salir de enfoque (F)":"Modo enfoque (F)"}
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

          {sug && (
            <div style={{ marginBottom:10, display:"flex", alignItems:"center", gap:8,
              background: sug.accion==="aprobar" ? DS.greenXL : DS.redXL,
              border:`1px solid ${sug.accion==="aprobar"?DS.green:DS.red}20`,
              borderRadius:7, padding:"7px 12px" }}>
              <span style={{ fontSize:11, color: sug.accion==="aprobar"?DS.green:DS.red }}>✦</span>
              <span style={{ fontFamily:DS.sans, fontSize:11,
                color: sug.accion==="aprobar" ? DS.green : DS.red }}>
                <strong>Sugerencia:</strong> {sug.accion} — {sug.motivo}. La decisión es tuya.
              </span>
            </div>
          )}

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
                {caso.plazo_descripcion ? ` — ${caso.plazo_descripcion}` : ""}
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

        {/* TAB: ANÁLISIS */}
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
                  <div style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:8, padding:"12px 14px" }}>
                    <div style={{ fontFamily:DS.sans, fontSize:9, color:DS.slateL, textTransform:"uppercase",
                      letterSpacing:"0.1em", marginBottom:4 }}>Confianza del análisis</div>
                    <div style={{ fontFamily:DS.serif, fontSize:24, fontWeight:700,
                      color: caso.analisis.confianza>=0.7?DS.green:caso.analisis.confianza>=0.5?DS.amber:DS.red,
                      marginBottom:4 }}>
                      {Math.round(caso.analisis.confianza*100)}%
                    </div>
                    {caso.analisis.criterio && (
                      <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, lineHeight:1.45 }}>
                        {caso.analisis.criterio}
                      </div>
                    )}
                  </div>
                  <div style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:8, padding:"12px 14px" }}>
                    <div style={{ fontFamily:DS.sans, fontSize:9, color:DS.slateL, textTransform:"uppercase",
                      letterSpacing:"0.1em", marginBottom:4 }}>Nivel de riesgo</div>
                    <div style={{ fontFamily:DS.serif, fontSize:24, fontWeight:700, color:rColor, marginBottom:4 }}>
                      {caso.analisis.riesgo.charAt(0).toUpperCase()+caso.analisis.riesgo.slice(1)}
                    </div>
                    <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, lineHeight:1.45 }}>
                      {caso.analisis.escalar
                        ? `⚑ ${caso.analisis.motivo_escalar || "El agente recomienda escalar"}`
                        : "Sin escalamiento requerido"}
                    </div>
                  </div>
                </div>

                {caso.analisis.riesgos.length > 0 && (
                  <div style={{ marginBottom:18 }}>
                    <SectionLabel icon="⚑">Riesgos detectados</SectionLabel>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {caso.analisis.riesgos.map((r,i) => (
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                          padding:"9px 12px", background:DS.redXL, borderRadius:7,
                          borderLeft:`3px solid ${DS.red}` }}>
                          <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, lineHeight:1.5, flex:1 }}>
                            {typeof r==="string" ? r : JSON.stringify(r)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                    {caso.analisis.plazos.map((p,i) => {
                      const desc = typeof p === "string" ? p : (p.descripcion || JSON.stringify(p));
                      const dias = typeof p === "object" && p.dias != null ? p.dias : null;
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
                          padding:"10px 14px", background:DS.amberL, borderRadius:7, marginBottom:5 }}>
                          {dias !== null && (
                            <div style={{ width:40, height:40, borderRadius:7, background:"rgba(255,255,255,0.5)",
                              display:"flex", flexDirection:"column", alignItems:"center",
                              justifyContent:"center", flexShrink:0 }}>
                              <span style={{ fontFamily:DS.serif, fontSize:18, fontWeight:700,
                                color:DS.amber, lineHeight:1 }}>{dias}</span>
                              <span style={{ fontFamily:DS.sans, fontSize:7, color:DS.amber, fontWeight:600 }}>días</span>
                            </div>
                          )}
                          <span style={{ fontFamily:DS.sans, fontSize:12, fontWeight:600, color:DS.ink }}>{desc}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {caso.analisis.fuentes.length > 0 && (
                  <div style={{ marginBottom:18 }}>
                    <SectionLabel icon="◈">Fuentes consultadas</SectionLabel>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {caso.analisis.fuentes.map((f,i) => {
                        const nombre = typeof f==="string" ? f : (f.nombre||JSON.stringify(f));
                        return (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:10,
                            padding:"8px 12px", background:DS.bg, borderRadius:7 }}>
                            <span style={{ fontFamily:DS.mono, fontSize:9, color:DS.gold,
                              fontWeight:700, flexShrink:0 }}>◈</span>
                            <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, flex:1 }}>{nombre}</span>
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
                    {guardandoNota ? "Guardando…" : "Guardar nota"}
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
                <SectionLabel icon="◈">Lección registrada</SectionLabel>
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
            <SectionLabel icon="◈">Cliente</SectionLabel>
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
                  <div style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, fontWeight:500 }}>{v||"—"}</div>
                </div>
              ))}
            </div>
            <SectionLabel icon="☰">Consulta original</SectionLabel>
            <div style={{ background:DS.bg, border:`1px solid ${DS.border}`, borderRadius:8, padding:"14px 16px" }}>
              <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.inkM, margin:0,
                lineHeight:1.75, fontStyle:"italic" }}>"{caso.consulta_raw || caso.asunto}"</p>
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

        {/* TAB: CIERRE */}
        {tab==="cierre" && !cerrado && (
          <div style={{ animation:"fadeUp .25s ease" }}>
            <SectionLabel icon="◈">Lección aprendida → RAG</SectionLabel>
            <div style={{ background:DS.goldFaint, border:`1px solid ${DS.goldLine}`,
              borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
              <p style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL, margin:"0 0 8px", lineHeight:1.5 }}>
                Esta lección alimenta el conocimiento del sistema para casos futuros.
              </p>
              <textarea value={leccion} onChange={e=>setLeccion(e.target.value)}
                placeholder="Ej: Art. 161 CT aplica cuando hay necesidades de la empresa documentadas…"
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
                * "Aprobar y enviar" requiere análisis del agente.
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

// ─── PANTALLA: HOY ────────────────────────────────────────────────────────────
// Una sola pregunta respondida: ¿qué necesita mi atención?
function PantallaHoy({ casos, plazos, setNav, abrirCaso }) {
  const activos    = casos.filter(c => c.estado !== "CERRADO");
  const escalados  = activos.filter(c => c.estado === "ESCALADO");
  const hitl       = activos.filter(c => c.estado === "HITL");
  const vencidos   = activos.filter(c => slaInfo(c.sla_horas, c.horas_transcurridas).label === "Vencido");
  const plazosCrit = plazos.filter(p => p.dias <= 3 && !p.gestionado);
  const cerradosHoy = casos.filter(c => c.estado === "CERRADO" && c.historial.some(h =>
    h.tipo === "abogado" && new Date(h.ts).toDateString() === new Date().toDateString())).length;

  // Lista única de atención, ordenada por urgencia real
  const items = [];
  escalados.forEach(c => items.push({
    tipo:"caso", peso: 30 + c.horas_transcurridas / c.sla_horas, caso:c,
    motivo:"Escalado — requiere tu intervención", color:DS.red,
  }));
  plazosCrit.forEach(p => items.push({
    tipo:"plazo", peso: 25 - p.dias * 2, plazo:p,
    motivo: p.dias <= 0 ? "Plazo VENCIDO" : `Plazo vence en ${p.dias} día${p.dias!==1?"s":""}`,
    color:DS.red,
  }));
  hitl.forEach(c => {
    const venc = slaInfo(c.sla_horas, c.horas_transcurridas).label === "Vencido";
    items.push({
      tipo:"caso", peso: (venc ? 15 : 5) + c.horas_transcurridas / (c.sla_horas * 4), caso:c,
      motivo: venc ? "Pendiente de revisión — SLA vencido" : "Pendiente de revisión",
      color: venc ? DS.amber : DS.blue,
    });
  });
  items.sort((a,b) => b.peso - a.peso);
  const top = items.slice(0, 8);
  const restantes = items.length - top.length;

  const pendientes = escalados.length + hitl.length;

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"32px 40px", background:DS.bg }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        {/* Saludo */}
        <div style={{ marginBottom:28, animation:"fadeUp .3s ease" }}>
          <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>
            {saludo()}, Kurt.
          </h1>
          <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:0 }}>
            {new Date().toLocaleDateString("es-CL",{ weekday:"long", day:"numeric", month:"long" })}
            {" — "}
            {pendientes === 0 && plazosCrit.length === 0
              ? "nada requiere tu atención."
              : `${items.length} tema${items.length!==1?"s":""} requieren tu atención.`}
          </p>
        </div>

        {/* Tres números — solo los que importan */}
        <div style={{ display:"flex", gap:28, marginBottom:32, animation:"fadeUp .35s ease" }}>
          {[
            { label:"Por revisar",     val:pendientes,        color: pendientes>0 ? DS.amber : DS.green,
              onClick: pendientes>0 ? ()=>setNav("revisar") : null },
            { label:"Plazos críticos", val:plazosCrit.length, color: plazosCrit.length>0 ? DS.red : DS.green,
              onClick: plazosCrit.length>0 ? ()=>setNav("agenda") : null },
            { label:"SLA vencidos",    val:vencidos.length,   color: vencidos.length>0 ? DS.red : DS.green,
              onClick: vencidos.length>0 ? ()=>setNav("casos") : null },
            { label:"Cerrados hoy",    val:cerradosHoy,       color: DS.slate, onClick:null },
          ].map(({label,val,color,onClick}) => (
            <div key={label} onClick={onClick||undefined}
              style={{ cursor:onClick?"pointer":"default" }}>
              <div style={{ fontFamily:DS.serif, fontSize:40, fontWeight:700, color, lineHeight:1 }}>{val}</div>
              <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL, marginTop:4 }}>
                {label}{onClick && <span style={{ color, fontWeight:600 }}> →</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Lista de atención o estado en calma */}
        {top.length === 0 ? (
          <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:14,
            padding:"56px 24px", textAlign:"center", animation:"fadeUp .4s ease" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:DS.greenL,
              display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
              <span style={{ fontSize:28, color:DS.green }}>✓</span>
            </div>
            <div style={{ fontFamily:DS.serif, fontSize:24, fontWeight:700, color:DS.ink, marginBottom:4 }}>
              Todo al día.
            </div>
            <div style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL }}>
              No hay casos ni plazos que requieran tu atención ahora.
            </div>
          </div>
        ) : (
          <div style={{ animation:"fadeUp .4s ease" }}>
            <SectionLabel icon="◎">Necesita tu atención</SectionLabel>
            <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:12, overflow:"hidden" }}>
              {top.map((item, i) => (
                <div key={i}
                  onClick={() => {
                    if (item.tipo === "caso") abrirCaso(item.caso.uuid);
                    else setNav("agenda");
                  }}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 20px",
                    borderBottom: i < top.length-1 ? `1px solid ${DS.border}` : "none",
                    cursor:"pointer", transition:"background .12s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=DS.bg}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:item.color, flexShrink:0 }}/>
                  {item.tipo === "caso" ? (
                    <>
                      <div style={{ width:26, height:26, borderRadius:5,
                        background:AREA_COLOR[item.caso.area]||DS.slate,
                        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:800, color:"#fff" }}>
                          {AREA_ICON[item.caso.area]||"?"}
                        </span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {item.caso.cliente.empresa} — {item.caso.asunto.slice(0,60)}
                        </div>
                        <div style={{ fontFamily:DS.sans, fontSize:11, color:item.color, fontWeight:600 }}>
                          {item.motivo}
                        </div>
                      </div>
                      <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, flexShrink:0 }}>
                        {timeAgo(item.caso.ingreso)}
                      </span>
                    </>
                  ) : (
                    <>
                      <div style={{ width:26, height:26, borderRadius:5, background:DS.redL,
                        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:12 }}>⏰</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {item.plazo.tipo} — {item.plazo.asunto.slice(0,60)}
                        </div>
                        <div style={{ fontFamily:DS.sans, fontSize:11, color:item.color, fontWeight:600 }}>
                          {item.motivo}
                        </div>
                      </div>
                      <span style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, flexShrink:0 }}>
                        {new Date(item.plazo.fecha).toLocaleDateString("es-CL",{day:"2-digit",month:"short"})}
                      </span>
                    </>
                  )}
                  <span style={{ color:DS.slateXL, fontSize:14, flexShrink:0 }}>›</span>
                </div>
              ))}
            </div>
            {restantes > 0 && (
              <div style={{ textAlign:"center", marginTop:12 }}>
                <button onClick={()=>setNav("revisar")}
                  style={{ border:"none", background:"transparent", cursor:"pointer",
                    fontFamily:DS.sans, fontSize:12, color:DS.gold, fontWeight:600 }}>
                  Ver los {restantes} restantes en Revisar →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PANTALLA: REVISAR / CASOS (componente compartido) ───────────────────────
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
    if (filtroEstado==="TODOS")         okE = true;
    else if (filtroEstado==="HITL_ESC") okE = c.estado==="HITL"||c.estado==="ESCALADO";
    else okE = c.estado===filtroEstado;
    const okA = filtroArea==="TODAS" || c.area===filtroArea;
    const q   = search.toLowerCase();
    const okS = !q
      || c.cliente.empresa.toLowerCase().includes(q)
      || c.id.toLowerCase().includes(q)
      || c.asunto.toLowerCase().includes(q)
      || c.analisis.resumen.toLowerCase().includes(q)
      || c.cliente.nombre.toLowerCase().includes(q)
      || (c.cliente.rut||"").includes(q);
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

    if (tipo==="procesar") {
      showToast("Enviando al agente IA…","info");
      await actualizarEstado(uuid,"EN_REVISION");
      const r = await dispararWebhook(WH.procesar, { caso_id:uuid, area:caso.area });
      if (r.ok) showToast("Agente procesando — se actualizará solo","ok");
      else showToast("Error al conectar con n8n","err");
      return;
    }

    if (tipo==="guardarNota") {
      const e = await actualizarNota(uuid, data);
      if (e) showToast("Error al guardar nota","err");
      else   showToast("Nota guardada","ok");
      return;
    }

    if (tipo==="aprobar") {
      showToast("Enviando aprobación…","info");
      setSesion(s=>({...s,aprobados:s.aprobados+1}));
      const r = await dispararWebhook(WH.aprobar, {
        caso_id: uuid,
        nota:    data?.nota||"",
        folio:   caso.id,
      });
      if (r.ok) {
        await actualizarEstado(uuid,"CERRADO");
        showToast("Aprobado — email enviado al cliente","ok");
        if (soloHITL) autoAvanzar(uuid);
      } else showToast("Error al aprobar","err");
      return;
    }

    if (tipo==="escalar") {
      showToast("Escalando caso…","info");
      setSesion(s=>({...s,escalados:s.escalados+1}));
      const r = await dispararWebhook(WH.escalar, {
        caso_id: uuid, area: caso.area, folio: caso.id,
      });
      await actualizarEstado(uuid,"ESCALADO");
      if (r.ok) showToast("Escalado — notificado en Slack","warn");
      else      showToast("Escalado en Supabase","warn");
      return;
    }

    if (tipo==="rechazar") {
      setSesion(s=>({...s,rechazados:s.rechazados+1}));
      await actualizarEstado(uuid,"HITL");
      showToast("Devuelto a cola de revisión","warn");
      return;
    }

    if (tipo==="info") {
      showToast("Solicitando información al cliente…","info");
      const r = await dispararWebhook(WH.info, {
        caso_id: uuid,
        folio: caso.id,
        contacto_email: caso.cliente.email,
        contacto_nombre: caso.cliente.nombre,
        detalle: data?.nota || "",
      });
      await actualizarEstado(uuid, "EN_REVISION");
      if (r.ok) showToast("Solicitud enviada al cliente — caso en espera de info","ok");
      else      showToast("Marcado en espera (revisar webhook per-solicitar-info en n8n)","warn");
      if (soloHITL) autoAvanzar(uuid);
      return;
    }

    if (tipo==="cerrar") {
      const e = await cerrarCaso(uuid, data?.leccion||"");
      if (e) showToast("Error al cerrar","err");
      else {
        if (data?.leccion) {
          await dispararWebhook(WH.cerrar, { caso_id:uuid, leccion:data.leccion });
        }
        showToast("Caso cerrado","ok");
        if (soloHITL) autoAvanzar(uuid);
      }
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
    else { showToast("Guardado","ok"); setModalEditar(null); }
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
                {soloHITL ? "Por revisar" : "Todos los casos"}
              </span>
              <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>{filtered.length}</span>
            </div>
            <div style={{ position:"relative", marginBottom:10 }}>
              <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)",
                fontSize:13, color:DS.slateL }}>⌕</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Empresa, folio, RUT, asunto…"
                style={{ width:"100%", paddingLeft:28, height:32, background:DS.bgInput,
                  border:`1px solid ${DS.border}`, borderRadius:7, boxSizing:"border-box",
                  fontFamily:DS.sans, fontSize:12, color:DS.ink, outline:"none" }}
                onFocus={e=>e.target.style.borderColor=DS.gold}
                onBlur={e=>e.target.style.borderColor=DS.border}/>
            </div>
            {!soloHITL && (
              <>
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
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {areas.slice(0,8).map(a => {
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
              </>
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

// ─── PANTALLA: AGENDA ─────────────────────────────────────────────────────────
function PantallaAgenda({ plazos, loading, marcarGestionado, abrirCaso }) {
  const grupos = [
    { label:"Críticos — vencen en ≤3 días",     items:plazos.filter(p=>p.dias<=3&&!p.gestionado) },
    { label:"Próximos — 4 a 15 días",           items:plazos.filter(p=>p.dias>3&&p.dias<=15&&!p.gestionado) },
    { label:"En el horizonte — más de 15 días", items:plazos.filter(p=>p.dias>15&&!p.gestionado) },
    { label:"Gestionados",                      items:plazos.filter(p=>p.gestionado) },
  ];

  if (loading) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
      flexDirection:"column", gap:12, background:DS.bg }}>
      <span style={{ fontSize:32, color:DS.slateXL, display:"inline-block", animation:"spin 1.5s linear infinite" }}>⟳</span>
      <span style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL }}>Cargando plazos…</span>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>
        Agenda Legal
      </h1>
      <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:"0 0 28px" }}>
        {plazos.filter(p=>!p.gestionado).length} plazos activos
      </p>
      {plazos.length===0 && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
          flexDirection:"column", gap:12, padding:"60px 0" }}>
          <span style={{ fontSize:40, color:DS.slateXL }}>◷</span>
          <span style={{ fontFamily:DS.sans, fontSize:14, color:DS.slateL }}>Sin plazos registrados</span>
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
              const color = p.gestionado?DS.green:p.dias<=3?DS.red:p.dias<=7?DS.amber:DS.blue;
              const bg    = p.gestionado?DS.greenL:p.dias<=3?DS.redL:p.dias<=7?DS.amberL:DS.blueL;
              const diasLabel = p.gestionado?"✓":p.dias<0?"VENC":p.dias===0?"HOY":`${p.dias}d`;
              return (
                <div key={p.id}
                  onClick={p.caso_id ? ()=>abrirCaso(p.caso_id) : undefined}
                  style={{ background:DS.bgCard, border:`1px solid ${DS.border}`,
                  borderRadius:10, padding:"14px 18px", display:"flex", alignItems:"center", gap:14,
                  opacity: p.gestionado?0.6:1, transition:"opacity .3s",
                  cursor: p.caso_id ? "pointer" : "default" }}>
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
                    {p.caso_id && (
                      <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.gold, fontWeight:600, marginTop:3 }}>Ver caso →</div>
                    )}
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
                      <button onClick={(e)=>{ e.stopPropagation(); marcarGestionado(p.id); }}
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

// ─── PANTALLA: SISTEMA ────────────────────────────────────────────────────────
// La verdad sobre los agentes: vida operativa (¿corre?) + calidad (¿responde bien?).
function PantallaSistema({ agentesStatus, casos, lastUpdate }) {
  const totalTipados = agentesStatus.reduce((s,a)=>s+a.tipados,0);
  const totalCasos   = casos.length;
  const confGlobal = (() => {
    const c = casos.filter(x=>x.analisis.confianza>0);
    return c.length ? c.reduce((s,x)=>s+x.analisis.confianza,0)/c.length : 0;
  })();
  const enAlerta = agentesStatus.filter(a =>
    a.operativo==="dormido" || a.operativo==="sin_correr" || a.salud==="critico").length;

  const porArea = [...new Set(casos.map(c=>c.area))].map(area => ({
    area, count:casos.filter(c=>c.area===area).length, color:AREA_COLOR[area]||DS.slate,
  })).sort((a,b)=>b.count-a.count);
  const maxCount = Math.max(...porArea.map(p=>p.count),1);

  const chipOp = (a) => {
    if (a.operativo==="vivo")       return { txt:"Vivo",            c:DS.green, bg:DS.greenL };
    if (a.operativo==="dormido")    return { txt:`Dormido · ${a.horas_desde_run}h`, c:DS.red, bg:DS.redL };
    if (a.operativo==="sin_correr") return { txt:"No ha corrido",   c:DS.amber, bg:DS.amberL };
    return { txt:"Sin actividad",   c:DS.slate, bg:DS.border };
  };
  const calidadTxt = (a) =>
    a.salud==="sano" ? "Calidad sana" :
    a.salud==="atencion" ? "Confianza baja" :
    a.salud==="critico" ? "Calidad crítica" : "Sin confianza medida";

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:DS.bg }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:DS.serif, fontSize:28, fontWeight:700, color:DS.ink, margin:"0 0 4px" }}>Sistema</h1>
          <p style={{ fontFamily:DS.sans, fontSize:13, color:DS.slateL, margin:0 }}>
            Agentes A0–A7 · vida operativa y calidad en tiempo real desde Supabase
          </p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:DS.green, boxShadow:`0 0 6px ${DS.green}` }}/>
          <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL }}>
            Realtime activo{lastUpdate && ` · sync ${lastUpdate.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}`}
          </span>
        </div>
      </div>

      {/* Cuatro números del sistema */}
      <div style={{ display:"flex", gap:28, marginBottom:28 }}>
        {[
          { label:"Casos totales",    val:totalCasos,   color:DS.ink },
          { label:"Análisis tipados", val:totalTipados, color:DS.purple },
          { label:"Confianza global", val:`${Math.round(confGlobal*100)}%`,
            color: confGlobal>=0.7?DS.green:confGlobal>=0.5?DS.amber:DS.red },
          { label:"Agentes en alerta", val:enAlerta, color: enAlerta>0?DS.red:DS.green },
        ].map(({label,val,color}) => (
          <div key={label}>
            <div style={{ fontFamily:DS.serif, fontSize:36, fontWeight:700, color, lineHeight:1 }}>{val}</div>
            <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL, marginTop:4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Agentes */}
      <SectionLabel icon="⚙">Agentes</SectionLabel>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginBottom:28 }}>
        {agentesStatus.map(ag => {
          const op = chipOp(ag);
          const alerta = ag.operativo==="dormido" || ag.operativo==="sin_correr" || ag.salud==="critico";
          const borde = alerta ? op.c : DS.border;
          return (
            <div key={ag.id} style={{ background:DS.bgCard, border:`1px solid ${borde}`,
              borderRadius:10, padding:"16px 18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:7, background:DS.ink,
                    border:`1px solid ${DS.goldLine}`, display:"flex", alignItems:"center",
                    justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:DS.mono, fontSize:11, fontWeight:700, color:DS.gold }}>{ag.id}</span>
                  </div>
                  <div>
                    <div style={{ fontFamily:DS.sans, fontSize:13, fontWeight:600, color:DS.ink }}>{ag.nombre}</div>
                    <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL }}>
                      {ag.ultimo_run
                        ? `Última corrida hace ${timeAgo(ag.ultimo_run)}`
                        : "Nunca ha corrido"}
                      {ag.pendientes_area > 0 && ` · ${ag.pendientes_area} en cola`}
                    </div>
                  </div>
                </div>
                <span style={{ fontFamily:DS.sans, fontSize:10, fontWeight:700, color:op.c,
                  background:op.bg, padding:"3px 9px", borderRadius:4, whiteSpace:"nowrap" }}>{op.txt}</span>
              </div>

              {/* Calidad */}
              {ag.conf_prom !== null
                ? <ConfBar val={ag.conf_prom}/>
                : <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, fontStyle:"italic" }}>
                    Sin datos de confianza aún
                  </div>}
              <div style={{ fontFamily:DS.sans, fontSize:10, color:DS.slateL, marginTop:6 }}>
                {calidadTxt(ag)}
                {ag.casos_total > 0 && ` · ${ag.casos_total} caso${ag.casos_total!==1?"s":""} · ${ag.escalados} escalado${ag.escalados!==1?"s":""} · ${ag.tipados} tipado${ag.tipados!==1?"s":""}`}
              </div>

              {alerta && (
                <div style={{ marginTop:10, padding:"8px 12px", background:op.bg, borderRadius:7 }}>
                  <span style={{ fontFamily:DS.sans, fontSize:11, color:op.c }}>
                    {ag.operativo==="dormido"
                      ? `⚑ ${ag.pendientes_area} caso(s) en cola y sin correr hace ${ag.horas_desde_run}h — revisar workflow n8n de esta área`
                      : ag.operativo==="sin_correr"
                        ? "⚠ Hay casos en cola pero el agente nunca ejecutó — verificar webhook/trigger"
                        : "⚑ Confianza crítica o escalación alta — reforzar prompt y RAG del área"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Distribución por área */}
      <SectionLabel icon="↗">Casos por área</SectionLabel>
      <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, padding:"20px 24px" }}>
        {porArea.map(({ area, count, color }) => (
          <div key={area} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
            <div style={{ width:22, height:22, borderRadius:4, background:color,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <span style={{ fontFamily:DS.sans, fontSize:9, fontWeight:800, color:"#fff" }}>{AREA_ICON[area]||"?"}</span>
            </div>
            <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink, width:90 }}>{area}</span>
            <div style={{ flex:1, height:20, background:DS.bg, borderRadius:4, overflow:"hidden" }}>
              <div style={{ width:`${(count/maxCount)*100}%`, height:"100%", background:color,
                borderRadius:4, transition:"width .6s" }}/>
            </div>
            <span style={{ fontFamily:DS.sans, fontSize:12, fontWeight:700, color:DS.ink, minWidth:16 }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Métricas de operación (fusionadas desde v3) */}
      <div style={{ marginTop:28 }}>
        <SectionLabel icon="↗">Métricas de operación</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
          {(() => {
            const slaOk    = casos.filter(c=>slaInfo(c.sla_horas,c.horas_transcurridas).label!=="Vencido").length;
            const slaRate  = casos.length ? Math.round((slaOk/casos.length)*100) : 0;
            const cerrados = casos.filter(c=>c.estado==="CERRADO").length;
            const conIA    = casos.filter(c=>c.analisis.resumen&&c.analisis.resumen.length>10).length;
            return [
              { label:"Tasa SLA en plazo", val:`${slaRate}%`, color:slaRate>=80?DS.green:DS.amber },
              { label:"Casos cerrados",    val:cerrados,      color:DS.green },
              { label:"Con análisis IA",   val:conIA,         color:DS.purple },
            ];
          })().map(({label,val,color}) => (
            <div key={label} style={{ background:DS.bgCard, border:`1px solid ${DS.border}`,
              borderRadius:10, padding:"16px 18px" }}>
              <div style={{ fontFamily:DS.serif, fontSize:30, fontWeight:700, color, lineHeight:1 }}>{val}</div>
              <div style={{ fontFamily:DS.sans, fontSize:11, color:DS.slateL, marginTop:5 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ background:DS.bgCard, border:`1px solid ${DS.border}`, borderRadius:10, padding:"20px 24px" }}>
          <SectionLabel icon="⚙">Confianza por área</SectionLabel>
          {porArea.map(({ area }) => {
            const casosArea = casos.filter(c=>c.area===area&&c.analisis.confianza>0);
            const confArea  = casosArea.length
              ? casosArea.reduce((s,c)=>s+c.analisis.confianza,0)/casosArea.length : 0;
            return (
              <div key={area} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <span style={{ fontFamily:DS.mono, fontSize:10, color:DS.gold, width:24, fontWeight:700 }}>{AREA_ICON[area]||"?"}</span>
                <span style={{ fontFamily:DS.sans, fontSize:11, color:DS.ink, flex:1 }}>{area}</span>
                <div style={{ width:120 }}><ConfBar val={confArea} showLabel={false}/></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
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

// ─── PANTALLA: CLIENTES (rescatada de v3) ─────────────────────────────────────
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

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props){ super(props); this.state = { err:null }; }
  static getDerivedStateFromError(err){ return { err }; }
  componentDidCatch(err, info){ console.error("Pantalla falló:", err, info); }
  render(){
    if (this.state.err) {
      return (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
          flexDirection:"column", gap:12, background:DS.bg, padding:32 }}>
          <span style={{ fontSize:40, color:DS.amber }}>⚠</span>
          <div style={{ fontFamily:DS.serif, fontSize:20, fontWeight:700, color:DS.ink }}>Esta sección tuvo un problema</div>
          <div style={{ fontFamily:DS.sans, fontSize:13, color:DS.slate, maxWidth:380, textAlign:"center", lineHeight:1.6 }}>
            El resto del panel sigue funcionando. Reintenta o cambia de sección.
          </div>
          <button onClick={()=>this.setState({ err:null })}
            style={{ padding:"9px 20px", borderRadius:7, border:"none", background:DS.ink,
              cursor:"pointer", fontFamily:DS.sans, fontSize:13, fontWeight:700, color:DS.gold }}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── OVERLAY DE ATAJOS (tecla ?) ──────────────────────────────────────────────
function AtajosOverlay({ open, onClose }) {
  if (!open) return null;
  const grupos = [
    ["Navegación", [["1–6","Cambiar sección"],["⌘K","Buscar / ir a"],["N","Nuevo caso"],["?","Este panel"]]],
    ["Revisar casos", [["A","Aprobar"],["E","Escalar"],["R","Rechazar"],["I","Pedir info al cliente"],["J / K","Anterior / siguiente"],["F","Modo enfoque"],["esc","Cerrar / salir"]]],
  ];
  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(12,27,46,0.45)", backdropFilter:"blur(2px)",
        zIndex:9500, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:DS.bgCard, borderRadius:14, width:460, maxWidth:"92vw",
          boxShadow:"0 24px 64px rgba(0,0,0,.35)", overflow:"hidden", animation:"cmdIn .15s ease" }}>
        <div style={{ padding:"18px 24px", borderBottom:`1px solid ${DS.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:DS.serif, fontSize:19, fontWeight:700, color:DS.ink }}>Atajos de teclado</span>
          <button onClick={onClose} style={{ border:"none", background:"transparent",
            cursor:"pointer", fontSize:18, color:DS.slateL }}>✕</button>
        </div>
        <div style={{ padding:"18px 24px" }}>
          {grupos.map(([titulo, filas]) => (
            <div key={titulo} style={{ marginBottom:18 }}>
              <SectionLabel>{titulo}</SectionLabel>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                {filas.map(([k,l]) => (
                  <div key={k} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"7px 10px", background:DS.bg, borderRadius:7 }}>
                    <Kbd>{k}</Kbd>
                    <span style={{ fontFamily:DS.sans, fontSize:12, color:DS.ink }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function PERApp() {
  const [nav,          setNav]          = useState("hoy");
  const [toast,        setToast]        = useState(null);
  const [modalNuevo,   setModalNuevo]   = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);
  const [cmdOpen,      setCmdOpen]      = useState(false);
  const [selIdExterno, setSelIdExterno] = useState(null);
  const [sesion,       setSesion]       = useState({ aprobados:0, escalados:0, rechazados:0 });
  const [atajos,       setAtajos]       = useState(false);

  const {
    casos, loading, error, lastUpdate, fetchCasos,
    actualizarEstado, actualizarNota, actualizarDatos, eliminarCaso, cerrarCaso,
  } = useCasosSupabase();

  const { plazos, loading:loadingPlazos, marcarGestionado } = usePlazosSupabase();
  const agentesStatus = useAgentesStatus();

  useEffect(() => {
    if (!document.getElementById("per-fonts")) {
      const l = document.createElement("link");
      l.id = "per-fonts";
      l.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap";
      l.rel  = "stylesheet";
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k") {
        e.preventDefault(); setCmdOpen(o=>!o); return;
      }
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if (cmdOpen||modalNuevo) return;
      const navMap = { "1":"hoy","2":"revisar","3":"casos","4":"agenda","5":"sistema","6":"clientes" };
      if (navMap[e.key]) { e.preventDefault(); setNav(navMap[e.key]); }
      if (e.key.toLowerCase()==="n") { e.preventDefault(); setModalNuevo(true); }
      if (e.key==="?") { e.preventDefault(); setAtajos(a=>!a); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdOpen, modalNuevo]);

  function showToast(msg, tipo="ok", onUndo=null) {
    setToast({ msg, tipo, onUndo });
    setTimeout(() => setToast(t => (t&&t.msg===msg?null:t)), onUndo ? 6000 : 3400);
  }

  function abrirCaso(uuid) {
    setSelIdExterno(uuid);
    setNav("revisar");
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
      canal:            "presencial",
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
    showToast(`Caso ${folio} creado`,"ok");
    setModalNuevo(false);
    setNav("revisar");
    await fetchCasos();
  }

  const revisarCount  = casos.filter(c=>c.estado==="HITL"||c.estado==="ESCALADO").length;
  const agendaCount   = plazos.filter(p=>p.dias<=3&&!p.gestionado).length;
  const sistemaAlerta = agentesStatus.some(a=>a.estado==="err");

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
      <AtajosOverlay open={atajos} onClose={()=>setAtajos(false)}/>
      <CommandPalette open={cmdOpen} onClose={()=>setCmdOpen(false)}
        casos={casos} setNav={setNav} selectCaso={id=>setSelIdExterno(id)}/>
      {modalNuevo && <ModalNuevoCaso onSave={handleNuevoCaso} onClose={()=>setModalNuevo(false)}/>}

      <Sidebar nav={nav} setNav={setNav}
        revisarCount={revisarCount} agendaCount={agendaCount} sistemaAlerta={sistemaAlerta}
        collapsed={collapsed} setCollapsed={setCollapsed}
        onCmd={()=>setCmdOpen(true)} lastUpdate={lastUpdate}/>

      <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", minWidth:0 }}>
        <TopBar nav={nav} sesion={sesion}
          onNuevoCaso={()=>setModalNuevo(true)} onRefresh={fetchCasos}/>
        <ErrorBoundary>
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

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

          {!loading && !error && nav==="hoy" && (
            <PantallaHoy casos={casos} plazos={plazos} setNav={setNav} abrirCaso={abrirCaso}/>
          )}
          {!loading && !error && nav==="revisar" && (
            <PantallaCasos casos={casos} actualizarEstado={actualizarEstado}
              actualizarNota={actualizarNota} actualizarDatos={actualizarDatos}
              eliminarCaso={eliminarCaso} cerrarCaso={cerrarCaso}
              showToast={showToast} soloHITL={true}
              sesion={sesion} setSesion={setSesion}
              selIdExterno={selIdExterno} setSelIdExterno={setSelIdExterno}/>
          )}
          {!loading && !error && nav==="casos" && (
            <PantallaCasos casos={casos} actualizarEstado={actualizarEstado}
              actualizarNota={actualizarNota} actualizarDatos={actualizarDatos}
              eliminarCaso={eliminarCaso} cerrarCaso={cerrarCaso}
              showToast={showToast}
              sesion={sesion} setSesion={setSesion}
              selIdExterno={selIdExterno} setSelIdExterno={setSelIdExterno}/>
          )}
          {!loading && !error && nav==="agenda" && (
            <PantallaAgenda plazos={plazos} loading={loadingPlazos} marcarGestionado={marcarGestionado} abrirCaso={abrirCaso}/>
          )}
          {!loading && !error && nav==="sistema" && (
            <PantallaSistema agentesStatus={agentesStatus} casos={casos} lastUpdate={lastUpdate}/>
          )}
          {!loading && !error && nav==="clientes" && <PantallaClientes casos={casos}/>}
        </div>
        </ErrorBoundary>
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

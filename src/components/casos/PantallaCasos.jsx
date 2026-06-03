import { useState, useEffect } from 'react'
import { DS, ESTADO_CFG, AREA_COLOR, AREA_ICON, CANAL_ICON,
         ETAPAS_SOP, fmtDate, fmtShort, horasLabel } from '../../lib/ds'

// ── Chips y barras ────────────────────────────────────────────
function Chip({ label, dot, bg, txt, size = 11 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
      background: bg, color: txt, fontSize: size, fontFamily: "'Outfit',sans-serif",
      fontWeight: 600, padding: '3px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%',
        background: dot, flexShrink: 0 }} />}
      {label}
    </span>
  )
}

function Bar({ pct, color, h = 3 }) {
  return (
    <div style={{ flex: 1, height: h, background: DS.creamDD, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%',
        background: color, borderRadius: 2, transition: 'width .5s' }} />
    </div>
  )
}

function ConfBar({ val }) {
  const pct   = Math.round((val || 0) * 100)
  const color = pct >= 70 ? DS.green : pct >= 55 ? DS.amber : DS.red
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
        color: DS.slateL, width: 58 }}>Confianza</span>
      <Bar pct={pct} color={color} />
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
        fontWeight: 700, color, minWidth: 28 }}>{pct}%</span>
    </div>
  )
}

function SlaBar({ slaHoras, horasTranscurridas }) {
  const pct   = Math.round((horasTranscurridas / slaHoras) * 100)
  const color = pct >= 100 ? DS.red : pct >= 75 ? DS.amber : DS.green
  const label = pct >= 100 ? 'Vencido' : pct >= 75 ? 'Urgente' : 'En plazo'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
        color: DS.slateL, width: 58 }}>SLA {slaHoras}h</span>
      <Bar pct={pct} color={color} />
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
        fontWeight: 700, color, minWidth: 52 }}>{label}</span>
    </div>
  )
}

function SopBar({ etapa }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: DS.slateL,
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
        Etapa del caso
      </div>
      <div style={{ display: 'flex', position: 'relative' }}>
        {ETAPAS_SOP.map((e, i) => {
          const done   = i < etapa - 1
          const active = i === etapa - 1
          return (
            <div key={i} style={{ flex: 1, display: 'flex',
              flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ width: '100%', height: 3,
                background: done ? DS.gold : active ? DS.goldL : DS.creamDD }} />
              <div style={{ width: 7, height: 7, borderRadius: '50%', marginTop: -2,
                background: done ? DS.gold : active ? DS.goldL : DS.creamDD,
                border: `1px solid ${done || active ? DS.gold : DS.creamDD}` }} />
              {active && (
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 8,
                  fontWeight: 700, color: DS.gold, marginTop: 4,
                  whiteSpace: 'nowrap', textAlign: 'center' }}>{e}</span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, color: DS.slateL }}>Intake</span>
        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, color: DS.slateL }}>Retro-loop</span>
      </div>
    </div>
  )
}

// ── Fila de caso en la lista ──────────────────────────────────
function CasoRow({ caso, selected, onClick }) {
  const est    = ESTADO_CFG[caso.estado] || ESTADO_CFG.HITL
  const ac     = AREA_COLOR[caso.area] || DS.slate
  const urgent = caso.estado === 'ESCALADO' || caso.estado === 'HITL'
  return (
    <div onClick={onClick} style={{
      padding: '13px 16px', borderBottom: `1px solid ${DS.creamD}`, cursor: 'pointer',
      background: selected ? DS.goldFaint : urgent ? 'rgba(148,96,16,0.04)' : DS.white,
      borderLeft: `3px solid ${selected ? DS.gold : urgent ? DS.amber : 'transparent'}`,
      transition: 'background .12s',
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = DS.creamM }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = urgent ? 'rgba(148,96,16,0.04)' : DS.white }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: ac,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9,
              fontWeight: 800, color: '#fff' }}>{AREA_ICON[caso.area] || '?'}</span>
          </div>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
            fontWeight: 700, color: DS.gold }}>#{caso.folio?.split('-')[2]}</span>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: DS.slateL }}>
            {caso.area}
          </span>
        </div>
        <Chip label={est.label} dot={est.dot} bg={est.bg} txt={est.txt} size={9} />
      </div>

      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600,
        color: DS.ink, marginBottom: 3, lineHeight: 1.2 }}>
        {caso.cliente_nombre || caso.cliente_rut}
      </div>
      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: DS.slate,
        marginBottom: 8, lineHeight: 1.4 }}>
        {(caso.asunto || '').length > 60 ? caso.asunto.slice(0, 60) + '…' : caso.asunto}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
            color: DS.slateL, width: 58 }}>Confianza</span>
          <Bar pct={Math.round((caso.confianza_ia || 0) * 100)}
            color={(caso.confianza_ia || 0) >= 0.7 ? DS.green : (caso.confianza_ia || 0) >= 0.55 ? DS.amber : DS.red} />
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, fontWeight: 700,
            color: (caso.confianza_ia || 0) >= 0.7 ? DS.green : DS.red, minWidth: 28 }}>
            {Math.round((caso.confianza_ia || 0) * 100)}%
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className={`ti ${CANAL_ICON[caso.canal] || 'ti-device-mobile'}`}
            style={{ fontSize: 12, color: DS.slateL }} />
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
            color: DS.slateL }}>{caso.canal}</span>
        </div>
        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: DS.slateXL }}>
          {horasLabel(caso.horas_transcurridas)}
        </span>
      </div>

      {caso.plazo_critico && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5,
          background: DS.redL, padding: '4px 8px', borderRadius: 4 }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 11, color: DS.red }} />
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9,
            color: DS.red, fontWeight: 700 }}>
            Plazo: {new Date(caso.plazo_critico).toLocaleDateString('es-CL')}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Panel de historial ────────────────────────────────────────
function HistItem({ item }) {
  const cfgs = {
    sistema: { bg: DS.creamD,    txt: DS.slate, lbl: 'SIS' },
    ia:      { bg: DS.goldFaint, txt: DS.gold,  lbl: 'IA'  },
    abogado: { bg: DS.blueL,     txt: DS.blue,  lbl: 'ABG' },
  }
  const c = cfgs[item.tipo_actor] || cfgs.sistema
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.bg,
          border: `1px solid ${c.txt}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9,
            fontWeight: 800, color: c.txt }}>{c.lbl}</span>
        </div>
        <div style={{ width: 1, flex: 1, background: DS.creamD, marginTop: 4 }} />
      </div>
      <div style={{ paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
            fontWeight: 700, color: c.txt }}>{item.actor}</span>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
            color: DS.slateL }}>{fmtShort(item.created_at)}</span>
        </div>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
          color: DS.slate, margin: 0, lineHeight: 1.55 }}>{item.mensaje}</p>
      </div>
    </div>
  )
}

// ── Detalle del caso ──────────────────────────────────────────
function CasoDetail({ caso, fetchHistorial, aprobarCaso, escalarCaso, cerrarCaso, agregarHistorial, showToast }) {
  const [tab,      setTab]     = useState('resumen')
  const [historial,setHistorial] = useState([])
  const [nota,     setNota]    = useState('')
  const [leccion,  setLeccion] = useState('')
  const [loadingH, setLoadingH] = useState(false)

  const est    = ESTADO_CFG[caso.estado] || ESTADO_CFG.HITL
  const ac     = AREA_COLOR[caso.area] || DS.slate
  const cerrado = caso.estado === 'CERRADO'

  // Cargar historial cuando se abre la tab
  useEffect(() => {
    if (tab !== 'historial') return
    setLoadingH(true)
    fetchHistorial(caso.id)
      .then(data => setHistorial(data))
      .finally(() => setLoadingH(false))
  }, [tab, caso.id, fetchHistorial])

  async function handleAccion(tipo) {
    try {
      if (tipo === 'aprobar')   await aprobarCaso(caso.id, nota)
      if (tipo === 'escalar')   await escalarCaso(caso.id, nota)
      if (tipo === 'cerrar')    await cerrarCaso(caso.id, nota, leccion)
      if (tipo === 'responder') await agregarHistorial(caso.id, 'Abogado', 'abogado',
        nota || 'Respuesta enviada al cliente.')
      const msgs = {
        aprobar: 'Borrador aprobado y enviado', responder: 'Respuesta registrada',
        escalar: 'Caso escalado — Slack notificado', cerrar: 'Caso cerrado',
      }
      showToast(msgs[tipo], tipo === 'escalar' ? 'warn' : 'ok')
      setNota(''); setLeccion('')
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  const TABS = [
    { id: 'resumen',   label: 'Resumen',    icon: 'ti-clipboard-text' },
    { id: 'historial', label: 'Historial',  icon: 'ti-timeline' },
    { id: 'docs',      label: 'Documentos', icon: 'ti-folder',
      count: (caso.documentos || []).length },
    ...(!cerrado ? [{ id: 'accion', label: 'Acciones', icon: 'ti-bolt' }] : []),
  ]

  const fuentes = (() => {
    try { return Array.isArray(caso.fuentes_rag) ? caso.fuentes_rag : JSON.parse(caso.fuentes_rag || '[]') }
    catch { return [] }
  })()

  const acciones = (() => {
    try { return Array.isArray(caso.acciones_pendientes) ? caso.acciones_pendientes : JSON.parse(caso.acciones_pendientes || '[]') }
    catch { return [] }
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DS.white }}>
      {/* Header */}
      <div style={{ padding: '20px 26px 0', borderBottom: `1px solid ${DS.creamD}`,
        background: DS.cream, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ background: DS.ink, borderRadius: 6, padding: '4px 12px',
                border: `1px solid ${DS.goldLine}`, display: 'inline-flex' }}>
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
                  fontWeight: 800, color: DS.gold, letterSpacing: '0.06em' }}>
                  {caso.folio}
                </span>
              </div>
              <Chip label={est.label} dot={est.dot} bg={est.bg} txt={est.txt} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, fontWeight: 700,
                color: caso.prioridad === 'CRITICA' ? DS.red : caso.prioridad === 'ALTA' ? DS.amber : DS.blue }}>
                ● {caso.prioridad}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: ac,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
                  fontWeight: 800, color: '#fff' }}>{AREA_ICON[caso.area]}</span>
              </div>
              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22,
                fontWeight: 700, color: DS.ink }}>
                {caso.cliente_nombre || caso.cliente_rut}
              </span>
            </div>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
              color: DS.slateL, marginTop: 3 }}>
              {caso.cliente_rut} · Kit {caso.kit || '—'} · Agente {caso.agente_id}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5,
              background: DS.creamD, borderRadius: 6, padding: '5px 10px' }}>
              <i className={`ti ${CANAL_ICON[caso.canal] || 'ti-device-mobile'}`}
                style={{ fontSize: 14, color: DS.slateL }} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
                fontWeight: 600, color: DS.slate }}>{caso.canal}</span>
            </div>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: DS.slateL }}>
              {fmtDate(caso.ingresado_at)}
            </span>
          </div>
        </div>

        <p style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic',
          fontSize: 15, color: DS.inkM, margin: '0 0 12px', lineHeight: 1.4 }}>
          "{caso.asunto}"
        </p>

        <SopBar etapa={caso.etapa_sop || 1} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
          <ConfBar val={caso.confianza_ia} />
          <SlaBar slaHoras={caso.sla_horas} horasTranscurridas={caso.horas_transcurridas} />
        </div>

        {caso.plazo_critico && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: DS.redL,
            border: `1px solid ${DS.red}25`, borderRadius: 7, padding: '8px 12px', marginBottom: 12 }}>
            <i className="ti ti-alarm" style={{ fontSize: 16, color: DS.red }} />
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
              fontWeight: 700, color: DS.red }}>Plazo crítico: </span>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: DS.red }}>
              {new Date(caso.plazo_critico).toLocaleDateString('es-CL',
                { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
        )}

        {fuentes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 12 }}>
            <i className="ti ti-database" style={{ fontSize: 12, color: DS.gold, marginTop: 2 }} />
            <div>
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 700,
                color: DS.gold, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Fuentes RAG ({fuentes.length}):{' '}
              </span>
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: DS.slate }}>
                {fuentes.join(' · ')}
              </span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
              background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.id ? DS.gold : 'transparent'}`,
              cursor: 'pointer',
            }}>
              <i className={`ti ${t.icon}`}
                style={{ fontSize: 13, color: tab === t.id ? DS.gold : DS.slateL }} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
                fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? DS.gold : DS.slateL }}>{t.label}</span>
              {t.count != null && (
                <span style={{ background: DS.creamD, borderRadius: 8, fontSize: 9,
                  fontWeight: 700, color: DS.slate, padding: '1px 5px' }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 26px' }}>

        {/* Resumen */}
        {tab === 'resumen' && (
          <>
            <SecLabel icon="ti-user">Datos del cliente</SecLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
              {[
                { icon: 'ti-user',  label: 'Nombre',   val: caso.contacto_nombre || '—' },
                { icon: 'ti-id',    label: 'RUT',      val: caso.cliente_rut },
                { icon: 'ti-mail',  label: 'Email',    val: caso.contacto_email || '—' },
                { icon: 'ti-phone', label: 'Teléfono', val: caso.contacto_tel || '—' },
              ].map(({ icon, label, val }) => (
                <div key={label} style={{ background: DS.creamM, borderRadius: 7,
                  padding: '9px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 14, color: DS.slateL, marginTop: 1 }} />
                  <div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, color: DS.slateL,
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>{label}</div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
                      color: DS.ink, fontWeight: 500 }}>{val}</div>
                  </div>
                </div>
              ))}
            </div>

            <SecLabel icon="ti-cpu">Análisis del agente IA</SecLabel>
            <div style={{ background: `${DS.gold}09`, border: `1px solid ${DS.goldLine}`,
              borderRadius: 8, padding: '13px 16px', marginBottom: 18 }}>
              <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: DS.inkM,
                margin: 0, lineHeight: 1.65 }}>
                {caso.resumen_ia || 'Sin análisis generado.'}
              </p>
            </div>

            {acciones.length > 0 && (
              <>
                <SecLabel icon="ti-checklist">Próximas acciones</SecLabel>
                {acciones.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', background: DS.creamM, borderRadius: 7, marginBottom: 5 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4,
                      border: `1.5px solid ${DS.slateXL}`, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
                      color: DS.ink }}>{a}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* Historial */}
        {tab === 'historial' && (
          <>
            <SecLabel icon="ti-timeline">Línea de tiempo</SecLabel>
            {loadingH
              ? <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13,
                  color: DS.slateL }}>Cargando…</p>
              : historial.length === 0
                ? <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13,
                    color: DS.slateL }}>Sin entradas.</p>
                : historial.map((h, i) => <HistItem key={i} item={h} />)
            }
          </>
        )}

        {/* Documentos */}
        {tab === 'docs' && (
          <>
            <SecLabel icon="ti-folder">Documentos generados</SecLabel>
            {(Array.isArray(caso.documentos) ? caso.documentos : []).length === 0
              ? <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13,
                  color: DS.slateL }}>Sin documentos adjuntos.</p>
              : (caso.documentos || []).map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: DS.creamM, borderRadius: 7, marginBottom: 6 }}>
                  <i className="ti ti-file-description"
                    style={{ fontSize: 18, color: DS.blue }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
                      fontWeight: 600, color: DS.ink }}>{d.nombre}</div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
                      color: DS.slateL }}>{d.tipo?.toUpperCase()} · {d.size}</div>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* Acciones */}
        {tab === 'accion' && !cerrado && (
          <>
            <SecLabel icon="ti-pencil">Nota interna</SecLabel>
            <textarea value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Análisis, instrucciones o notas internas…"
              style={{ width: '100%', minHeight: 90, background: DS.cream,
                border: `1px solid ${DS.creamDD}`, borderRadius: 8, boxSizing: 'border-box',
                padding: '10px 13px', fontFamily: "'Outfit',sans-serif", fontSize: 13,
                color: DS.ink, resize: 'vertical', outline: 'none', lineHeight: 1.5, marginBottom: 18 }}
              onFocus={e => e.target.style.borderColor = DS.gold}
              onBlur={e => e.target.style.borderColor = DS.creamDD}
            />

            <SecLabel icon="ti-brain">Lección aprendida → RAG</SecLabel>
            <div style={{ background: `${DS.gold}08`, border: `1px solid ${DS.goldLine}`,
              borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
              <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
                color: DS.slateL, margin: '0 0 8px', lineHeight: 1.5 }}>
                Al cerrar, esta lección se enviará al RAG para mejorar futuros análisis.
              </p>
              <textarea value={leccion} onChange={e => setLeccion(e.target.value)}
                placeholder="Ej: Art. 192 CT aplica incluso en segunda omisión si no hay reincidencia en 3 años…"
                style={{ width: '100%', minHeight: 70, background: DS.white,
                  border: `1px solid ${DS.goldLine}`, borderRadius: 7, boxSizing: 'border-box',
                  padding: '9px 12px', fontFamily: "'Outfit',sans-serif", fontSize: 12,
                  color: DS.ink, resize: 'vertical', outline: 'none', lineHeight: 1.5 }}
                onFocus={e => e.target.style.borderColor = DS.gold}
                onBlur={e => e.target.style.borderColor = DS.goldLine}
              />
            </div>

            <SecLabel icon="ti-bolt">Ejecutar acción</SecLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { id: 'aprobar',   icon: 'ti-check',        label: 'Aprobar y enviar',  sub: 'Confirma al cliente',  color: DS.green },
                { id: 'responder', icon: 'ti-send',         label: 'Responder cliente', sub: 'Registra nota',        color: DS.blue  },
                { id: 'escalar',   icon: 'ti-alarm',        label: 'Escalar a equipo',  sub: 'Notifica Slack',       color: DS.amber },
                { id: 'cerrar',    icon: 'ti-circle-check', label: 'Cerrar caso',       sub: 'Archiva + envía RAG',  color: DS.slate },
              ].map(a => <AcBtn key={a.id} {...a} onClick={() => handleAccion(a.id)} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SecLabel({ children, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 10px' }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 13, color: DS.slateL }} />}
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 700,
        color: DS.slateL, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{children}</span>
    </div>
  )
}

function AcBtn({ icon, label, sub, color, onClick }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
        padding: '11px 13px', background: h ? color : 'transparent',
        border: `1px solid ${h ? color : DS.creamDD}`,
        borderRadius: 9, cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 15, color: h ? '#fff' : color }} />
        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
          fontWeight: 600, color: h ? '#fff' : color }}>{label}</span>
      </div>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
        color: h ? 'rgba(255,255,255,.7)' : DS.slateL }}>{sub}</span>
    </button>
  )
}

// ── Pantalla principal: lista + detalle ───────────────────────
export default function PantallaCasos({ casos, loading, error,
  fetchHistorial, aprobarCaso, escalarCaso, cerrarCaso, agregarHistorial, showToast }) {
  const [selId,  setSelId]  = useState(null)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('TODOS')

  // Seleccionar primero automáticamente
  useEffect(() => {
    if (casos.length > 0 && !selId) setSelId(casos[0].id)
  }, [casos, selId])

  const filtered = casos.filter(c => {
    const okE = filtro === 'TODOS' || c.estado === filtro
    const q   = search.toLowerCase()
    const okS = !q || (c.cliente_nombre || '').toLowerCase().includes(q) ||
      (c.folio || '').toLowerCase().includes(q) ||
      (c.cliente_rut || '').includes(q) ||
      (c.asunto || '').toLowerCase().includes(q)
    return okE && okS
  })

  const selCaso = casos.find(c => c.id === selId)

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: DS.slateL }}>
        Cargando casos…
      </span>
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 8 }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 32, color: DS.red }} />
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: DS.red }}>
        Error: {error}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Lista */}
      <div style={{ width: 300, background: DS.white, borderRight: `1px solid ${DS.creamD}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 10px', background: DS.cream,
          borderBottom: `1px solid ${DS.creamD}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18,
              fontWeight: 700, color: DS.ink }}>Casos activos</span>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
              color: DS.slateL }}>{filtered.length} casos</span>
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 9,
              top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: DS.slateL }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cliente, RUT, folio…"
              style={{ width: '100%', paddingLeft: 30, height: 32, background: DS.white,
                border: `1px solid ${DS.creamDD}`, borderRadius: 7, boxSizing: 'border-box',
                fontFamily: "'Outfit',sans-serif", fontSize: 12, color: DS.ink, outline: 'none' }}
              onFocus={e => e.target.style.borderColor = DS.gold}
              onBlur={e => e.target.style.borderColor = DS.creamDD}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['TODOS', 'HITL', 'ESCALADO', 'EN_REVISION', 'CERRADO'].map(e => {
              const cfg = ESTADO_CFG[e]
              const a   = filtro === e
              return (
                <button key={e} onClick={() => setFiltro(e)} style={{
                  fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${a ? (cfg?.dot || DS.gold) : DS.creamDD}`,
                  background: a ? (cfg ? cfg.bg : DS.goldFaint) : 'transparent',
                  color: a ? (cfg?.txt || DS.gold) : DS.slateL,
                }}>
                  {e === 'TODOS' ? 'Todos' : cfg?.label || e}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <i className="ti ti-search-off" style={{ fontSize: 32, color: DS.slateXL, display: 'block', marginBottom: 8 }} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: DS.slateL }}>Sin resultados</span>
            </div>
          )}
          {filtered.map(c => (
            <CasoRow key={c.id} caso={c} selected={selId === c.id} onClick={() => setSelId(c.id)} />
          ))}
        </div>
      </div>

      {/* Detalle */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {selCaso
          ? <CasoDetail caso={selCaso} fetchHistorial={fetchHistorial}
              aprobarCaso={aprobarCaso} escalarCaso={escalarCaso}
              cerrarCaso={cerrarCaso} agregarHistorial={agregarHistorial}
              showToast={showToast} />
          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', flexDirection: 'column', gap: 12 }}>
              <i className="ti ti-clipboard-text" style={{ fontSize: 40, color: DS.slateXL }} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: DS.slateL }}>
                Selecciona un caso
              </span>
            </div>
        }
      </div>
    </div>
  )
}

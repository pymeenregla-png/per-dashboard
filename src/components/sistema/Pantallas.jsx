// ── PantallaPlazos ────────────────────────────────────────────
import { DS } from '../../lib/ds'

export function PantallaPlazos({ plazos, loading, marcarCumplido, showToast }) {
  const grupos = [
    { label: 'Críticos (≤7 días)',  items: plazos.filter(p => p.dias_restantes <= 7)  },
    { label: 'Próximos (8–15 días)',items: plazos.filter(p => p.dias_restantes > 7 && p.dias_restantes <= 15) },
    { label: 'En el horizonte',     items: plazos.filter(p => p.dias_restantes > 15)  },
  ]

  const urgCfg = {
    critica: { color: DS.red,   bg: DS.redL   },
    alta:    { color: DS.amber, bg: DS.amberL },
    media:   { color: DS.blue,  bg: DS.blueL  },
    baja:    { color: DS.slate, bg: '#F5EFE4' },
  }

  async function handleCumplido(id) {
    try { await marcarCumplido(id); showToast('Plazo marcado como cumplido') }
    catch (e) { showToast(e.message, 'err') }
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: DS.slateL }}>Cargando plazos…</span>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: DS.creamM }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 700,
          color: DS.ink, margin: '0 0 4px' }}>Agenda Legal Crítica</h1>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: DS.slateL, margin: 0 }}>
          Vencimientos activos — marcas INAPI, SII, DT y contratos
        </p>
      </div>

      {plazos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <i className="ti ti-calendar-check" style={{ fontSize: 40, color: DS.slateXL, display: 'block', marginBottom: 12 }} />
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: DS.slateL }}>
            Sin plazos pendientes
          </span>
        </div>
      )}

      {grupos.map(({ label, items }) => items.length > 0 && (
        <div key={label} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, fontWeight: 700,
              color: DS.slateL, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: DS.creamD }} />
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: DS.slateL }}>{items.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(p => {
              const uc = urgCfg[p.urgencia_calculada] || urgCfg.baja
              const dias = p.dias_restantes
              const diasLabel = dias === 0 ? 'HOY' : dias === 1 ? 'Mañana' : `${dias}d`
              return (
                <div key={p.id} style={{ background: DS.white, border: `1px solid ${DS.creamD}`,
                  borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, background: uc.bg,
                    border: `1px solid ${uc.color}30`, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20,
                      fontWeight: 700, color: uc.color, lineHeight: 1 }}>{diasLabel}</span>
                    {dias > 1 && (
                      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 8,
                        color: uc.color, fontWeight: 600 }}>días</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, fontWeight: 700,
                        color: uc.color, background: uc.bg, padding: '2px 8px', borderRadius: 4 }}>
                        {p.tipo}
                      </span>
                      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: DS.slateL }}>
                        {p.caso_folio}
                      </span>
                    </div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600,
                      color: DS.ink, marginBottom: 2 }}>{p.cliente_nombre}</div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: DS.slate }}>
                      {p.asunto}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: DS.slateL }}>Vence</div>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15,
                        fontWeight: 700, color: DS.ink }}>
                        {new Date(p.fecha_vence).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                    <button onClick={() => handleCumplido(p.id)} style={{
                      fontSize: 11, fontFamily: "'Outfit',sans-serif", fontWeight: 600,
                      padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                      background: DS.greenL, border: `1px solid ${DS.green}30`, color: DS.green,
                    }}>✓ Cumplido</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── PantallaClientes ──────────────────────────────────────────
import { useState, useEffect } from 'react'

export function PantallaClientes({ clientes, loading, fetchCasosCliente }) {
  const [sel, setSel]       = useState(null)
  const [casosC, setCasosC] = useState([])

  useEffect(() => {
    if (sel === null) return
    fetchCasosCliente(clientes[sel]?.id).then(setCasosC)
  }, [sel, clientes, fetchCasosCliente])

  const cliente = clientes[sel]
  const ESTADO_CFG_LOCAL = {
    HITL:        { label: 'HITL',       bg: DS.amberL, txt: DS.amber },
    EN_REVISION: { label: 'En Revisión',bg: DS.blueL,  txt: DS.blue  },
    ESCALADO:    { label: 'Escalado',   bg: DS.redL,   txt: DS.red   },
    CERRADO:     { label: 'Cerrado',    bg: DS.greenL, txt: DS.green },
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: DS.slateL }}>Cargando…</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ width: 280, background: DS.white, borderRight: `1px solid ${DS.creamD}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', background: DS.cream, borderBottom: `1px solid ${DS.creamD}` }}>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18,
            fontWeight: 700, color: DS.ink }}>Clientes</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {clientes.map((c, i) => (
            <div key={c.id} onClick={() => setSel(i)} style={{
              padding: '13px 16px', borderBottom: `1px solid ${DS.creamD}`, cursor: 'pointer',
              background: sel === i ? DS.goldFaint : DS.white,
              borderLeft: `3px solid ${sel === i ? DS.gold : 'transparent'}`,
            }}
              onMouseEnter={e => { if (sel !== i) e.currentTarget.style.background = DS.creamM }}
              onMouseLeave={e => { if (sel !== i) e.currentTarget.style.background = DS.white }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13,
                  fontWeight: 600, color: DS.ink }}>{c.nombre}</span>
                {c.suscripcion && (
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 600,
                    color: DS.green, background: DS.greenL, padding: '2px 7px', borderRadius: 4 }}>
                    Suscripción
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: DS.slateL }}>
                {c.tipo} · {c.kit_activo || '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: DS.creamM, padding: '28px 32px' }}>
        {!cliente ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', flexDirection: 'column', gap: 12 }}>
            <i className="ti ti-building-store" style={{ fontSize: 40, color: DS.slateXL }} />
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: DS.slateL }}>
              Selecciona un cliente
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: DS.ink,
                border: `1px solid ${DS.goldLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20,
                  fontWeight: 700, color: DS.gold }}>{cliente.nombre[0]}</span>
              </div>
              <div>
                <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22,
                  fontWeight: 700, color: DS.ink, margin: 0 }}>{cliente.nombre}</h2>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: DS.slateL }}>
                  RUT {cliente.rut} · {cliente.tipo}
                </div>
              </div>
              {cliente.suscripcion && (
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, fontWeight: 600,
                  color: DS.green, background: DS.greenL, padding: '4px 10px', borderRadius: 6, marginLeft: 8 }}>
                  Abono mensual activo
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Kit activo',  val: cliente.kit_activo || '—', icon: 'ti-package' },
                { label: 'Canal origen',val: cliente.canal_origen || '—', icon: 'ti-device-mobile' },
                { label: 'NPS',         val: cliente.nps ?? '—',         icon: 'ti-star' },
              ].map(({ label, val, icon }) => (
                <div key={label} style={{ background: DS.white, border: `1px solid ${DS.creamD}`,
                  borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 16, color: DS.gold }} />
                    <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 700,
                      color: DS.slateL, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26,
                    fontWeight: 700, color: DS.ink }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 700,
              color: DS.slateL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
              Asuntos activos
            </div>
            {casosC.length === 0
              ? <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: DS.slateL }}>Sin casos.</p>
              : casosC.map(c => {
                const est = ESTADO_CFG_LOCAL[c.estado] || ESTADO_CFG_LOCAL.EN_REVISION
                return (
                  <div key={c.id} style={{ background: DS.white, border: `1px solid ${DS.creamD}`,
                    borderRadius: 10, padding: '12px 16px', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
                          fontWeight: 700, color: DS.gold }}>{c.folio}</span>
                        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 600,
                          color: est.txt, background: est.bg, padding: '2px 7px', borderRadius: 4 }}>
                          {est.label}
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, color: DS.ink }}>
                        {c.asunto}
                      </div>
                    </div>
                  </div>
                )
              })
            }
          </>
        )}
      </div>
    </div>
  )
}

// ── PantallaMetricas ──────────────────────────────────────────
export function PantallaMetricas({ metricas, loading }) {
  if (loading || !metricas) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: DS.slateL }}>Cargando métricas…</span>
    </div>
  )

  const kpis = [
    { label: 'Casos activos',    val: metricas.casosActivos,   icon: 'ti-trending-up',  color: DS.blue  },
    { label: 'HITL pendientes',  val: metricas.hitlPendientes, icon: 'ti-clock',        color: DS.amber },
    { label: 'Escalados',        val: metricas.escalados,      icon: 'ti-alarm',        color: DS.red   },
    { label: 'Plazos críticos',  val: metricas.plazosCriticos, icon: 'ti-calendar-x',  color: DS.red   },
    { label: 'Total clientes',   val: metricas.totalClientes,  icon: 'ti-building-store',color: DS.green},
    { label: 'Chunks RAG',       val: metricas.ragChunks?.toLocaleString('es-CL') || 0,
      icon: 'ti-database', color: DS.purple },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: DS.creamM }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 700,
          color: DS.ink, margin: '0 0 4px' }}>Métricas del sistema</h1>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: DS.slateL, margin: 0 }}>
          Estado en tiempo real · datos desde Supabase
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {kpis.map(({ label, val, icon, color }) => (
          <div key={label} style={{ background: DS.white, border: `1px solid ${DS.creamD}`,
            borderRadius: 10, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 3,
              height: '100%', background: color, borderRadius: '10px 0 0 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 16, color }} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 700,
                color: DS.slateL, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30,
              fontWeight: 700, color: DS.ink, lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PantallaAgentes ───────────────────────────────────────────
const AGENTES_MOCK = [
  { id:'A0', nombre:'Intake & Routing',  estado:'ok',  casos_hoy:12, escalados:1, conf_prom:0.81 },
  { id:'A1', nombre:'Societario',        estado:'ok',  casos_hoy:4,  escalados:0, conf_prom:0.79 },
  { id:'A2', nombre:'Marcas INAPI',      estado:'warn',casos_hoy:6,  escalados:2, conf_prom:0.58 },
  { id:'A3', nombre:'Contratos',         estado:'ok',  casos_hoy:3,  escalados:0, conf_prom:0.82 },
  { id:'A4', nombre:'Tributario SII',    estado:'ok',  casos_hoy:5,  escalados:0, conf_prom:0.88 },
  { id:'A5', nombre:'Laboral DT',        estado:'err', casos_hoy:2,  escalados:1, conf_prom:0.41 },
  { id:'A6', nombre:'Consumidor SERNAC', estado:'ok',  casos_hoy:1,  escalados:0, conf_prom:0.76 },
  { id:'A7', nombre:'Cobranza 30D',      estado:'ok',  casos_hoy:2,  escalados:0, conf_prom:0.83 },
]

export function PantallaAgentes() {
  const sCfg = {
    ok:   { color: DS.green, label: 'Operativo',    icon: 'ti-circle-check'   },
    warn: { color: DS.amber, label: 'Atención',     icon: 'ti-alert-triangle' },
    err:  { color: DS.red,   label: 'Intervención', icon: 'ti-alert-circle'   },
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: DS.creamM }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 700,
          color: DS.ink, margin: '0 0 4px' }}>Sistema multiagente</h1>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: DS.slateL, margin: 0 }}>
          Estado de los agentes A0–A7 + orquestador Cerebro AG
        </p>
      </div>

      {/* Orquestador */}
      <div style={{ background: DS.ink, border: `1px solid ${DS.goldLine}`,
        borderRadius: 10, padding: '16px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: DS.goldFaint,
          border: `1px solid ${DS.goldLine}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-brain" style={{ fontSize: 22, color: DS.gold }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18,
            fontWeight: 700, color: DS.gold }}>Cerebro AG — Orquestador principal</div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, color: DS.slateL }}>
            Coordina A0–A7 · JSON protocol · Supabase agent registry
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: DS.green,
            boxShadow: `0 0 8px ${DS.green}` }} />
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
            fontWeight: 600, color: DS.green }}>Operativo</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {AGENTES_MOCK.map(ag => {
          const s = sCfg[ag.estado]
          const pct = Math.round(ag.conf_prom * 100)
          const barColor = pct >= 70 ? DS.green : pct >= 55 ? DS.amber : DS.red
          return (
            <div key={ag.id} style={{ background: DS.white, border: `1px solid ${DS.creamD}`,
              borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: DS.inkM,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
                      fontWeight: 800, color: '#fff' }}>{ag.id}</span>
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13,
                      fontWeight: 600, color: DS.ink }}>{ag.nombre}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 14, color: s.color }} />
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
                    fontWeight: 700, color: s.color }}>{s.label}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[
                  { label: 'Casos hoy',  val: ag.casos_hoy },
                  { label: 'Escalados',  val: ag.escalados },
                  { label: 'Escalación', val: `${ag.casos_hoy > 0 ? Math.round(ag.escalados/ag.casos_hoy*100) : 0}%` },
                ].map(({ label, val }) => (
                  <div key={label} style={{ background: DS.creamM, borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 8, color: DS.slateL,
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18,
                      fontWeight: 700, color: DS.ink }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9,
                  color: DS.slateL, width: 56 }}>Conf. media</span>
                <div style={{ flex: 1, height: 3, background: DS.creamDD, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
                  fontWeight: 700, color: barColor, minWidth: 28 }}>{pct}%</span>
              </div>

              {ag.estado !== 'ok' && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
                  background: ag.estado === 'err' ? DS.redL : DS.amberL,
                  borderRadius: 5, padding: '5px 9px' }}>
                  <i className="ti ti-alert-triangle"
                    style={{ fontSize: 12, color: ag.estado === 'err' ? DS.red : DS.amber }} />
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
                    color: ag.estado === 'err' ? DS.red : DS.amber }}>
                    {ag.estado === 'err' ? 'Requiere intervención' : 'Tasa de escalación elevada'}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

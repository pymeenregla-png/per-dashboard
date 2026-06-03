import { DS } from '../../lib/ds'

// ── Sidebar ───────────────────────────────────────────────────
export default function Sidebar({ nav, setNav, urgentes }) {
  const items = [
    { id: 'casos',    icon: 'ti-inbox',         label: 'Casos'        },
    { id: 'plazos',   icon: 'ti-calendar-event', label: 'Agenda legal' },
    { id: 'clientes', icon: 'ti-building-store', label: 'Clientes'     },
    { id: 'metricas', icon: 'ti-chart-line',     label: 'Métricas'     },
    { id: 'sistema',  icon: 'ti-cpu',            label: 'Sistema IA'   },
    { id: 'rag',      icon: 'ti-database',       label: 'RAG / Fuentes'},
    { id: 'config',   icon: 'ti-settings',       label: 'Configuración'},
  ]

  return (
    <div style={{
      width: 212, background: DS.cream, borderRight: `1px solid ${DS.creamD}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 18px 16px', borderBottom: `1px solid ${DS.creamD}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, background: DS.ink, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${DS.goldLine}`,
          }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18,
              fontWeight: 700, color: DS.gold }}>P</span>
          </div>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16,
              fontWeight: 700, color: DS.ink, lineHeight: 1.1 }}>Pyme En Regla</div>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, color: DS.slateL,
              letterSpacing: '0.12em', textTransform: 'uppercase' }}>Panel Interno</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, paddingTop: 8, overflowY: 'auto' }}>
        {items.map(it => {
          const active = nav === it.id
          const badge  = it.id === 'casos' && urgentes > 0
          return (
            <button key={it.id} onClick={() => setNav(it.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '9px 18px', background: active ? DS.goldFaint : 'transparent',
              border: 'none', borderLeft: `2px solid ${active ? DS.gold : 'transparent'}`,
              cursor: 'pointer', transition: 'all .15s',
            }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = DS.creamM }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <i className={`ti ${it.icon}`}
                style={{ fontSize: 17, color: active ? DS.gold : DS.slateL, width: 18 }} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13,
                fontWeight: active ? 600 : 400, color: active ? DS.gold : DS.slate,
                flex: 1, textAlign: 'left' }}>{it.label}</span>
              {badge && (
                <span style={{ background: DS.red, color: '#fff', fontFamily: "'Outfit',sans-serif",
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>
                  {urgentes}
                </span>
              )}
            </button>
          )
        })}
        <div style={{ margin: '16px 18px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, fontWeight: 700,
            color: DS.slateXL, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Sistema</span>
          <div style={{ flex: 1, height: 1, background: DS.creamD }} />
        </div>
      </div>

      {/* RAG status */}
      <div style={{ padding: '10px 18px', borderTop: `1px solid ${DS.creamD}`,
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: DS.green,
          boxShadow: `0 0 6px ${DS.green}` }} />
        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10, color: DS.slate }}>
          RAG activo
        </span>
      </div>

      {/* Avatar */}
      <div style={{ padding: '12px 18px', borderTop: `1px solid ${DS.creamD}`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: DS.ink,
          border: `1px solid ${DS.goldLine}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center' }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11,
            fontWeight: 700, color: DS.gold }}>KL</span>
        </div>
        <div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12,
            fontWeight: 600, color: DS.ink }}>Kurt Leupin</div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 9, color: DS.slateL }}>
            Abogado · Admin</div>
        </div>
      </div>
    </div>
  )
}

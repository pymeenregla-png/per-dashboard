import { DS } from '../../lib/ds'

const TITLES = {
  casos: 'Gestión de casos', plazos: 'Agenda legal crítica',
  clientes: 'Clientes', metricas: 'Métricas del sistema',
  sistema: 'Sistema multiagente', rag: 'RAG y fuentes',
  config: 'Configuración',
}

export default function TopBar({ nav, metricas }) {
  return (
    <div style={{
      height: 52, background: DS.white, borderBottom: `1px solid ${DS.creamD}`,
      display: 'flex', alignItems: 'center', padding: '0 24px',
      justifyContent: 'space-between', flexShrink: 0,
    }}>
      <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13,
        fontWeight: 600, color: DS.slate }}>{TITLES[nav] || 'Panel PER'}</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {metricas && [
          { label: 'Activos', val: metricas.casosActivos,   color: DS.blue  },
          { label: 'HITL',    val: metricas.hitlPendientes, color: DS.amber },
          { label: 'Escalados',val: metricas.escalados,     color: DS.red   },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18,
              fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 8,
              color: DS.slateL, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}

        {/* Status badges */}
        {[
          { label: 'RAG',  color: DS.green, bg: DS.greenL },
          { label: 'n8n',  color: DS.blue,  bg: DS.blueL  },
        ].map(({ label, color, bg }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', background: bg, borderRadius: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 10,
              fontWeight: 600, color }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

import { DS } from '../../lib/ds'

export default function Toast({ toast }) {
  if (!toast) return null
  const cfg = {
    ok:   { bg: DS.green, icon: 'ti-check'          },
    warn: { bg: DS.amber, icon: 'ti-alert-triangle' },
    err:  { bg: DS.red,   icon: 'ti-x'              },
  }
  const c = cfg[toast.tipo] || cfg.ok
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 9999,
      background: c.bg, color: '#fff', padding: '11px 18px', borderRadius: 8,
      fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,.2)',
    }}>
      <i className={`ti ${c.icon}`} style={{ fontSize: 16 }} />
      {toast.msg}
    </div>
  )
}

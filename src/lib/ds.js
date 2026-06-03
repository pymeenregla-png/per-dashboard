// ── Design tokens ─────────────────────────────────────────────
export const DS = {
  ink:       '#0C1B2E', inkL: '#162843', inkM: '#1F3A5F',
  gold:      '#B8943A', goldL: '#CCA84A', goldFaint: 'rgba(184,148,58,0.10)',
  goldLine:  'rgba(184,148,58,0.25)',
  cream:     '#FDFAF4', creamM: '#F5EFE4', creamD: '#EDE4D4', creamDD: '#E2D6C2',
  white:     '#FFFFFF',
  slate:     '#5A6B7E', slateL: '#8A9BAE', slateXL: '#C4D0DC',
  green:     '#1A5E42', greenL: 'rgba(26,94,66,0.12)',
  amber:     '#946010', amberL: 'rgba(148,96,16,0.12)',
  red:       '#8B1E1E', redL:   'rgba(139,30,30,0.10)',
  blue:      '#1A3F7A', blueL:  'rgba(26,63,122,0.10)',
  purple:    '#3D2E8A', purpleL:'rgba(61,46,138,0.10)',
}

export const ESTADO_CFG = {
  HITL:        { label: 'HITL Pendiente', dot: DS.amber, bg: DS.amberL, txt: DS.amber },
  EN_REVISION: { label: 'En Revisión',   dot: DS.blue,  bg: DS.blueL,  txt: DS.blue  },
  ESCALADO:    { label: 'Escalado',      dot: DS.red,   bg: DS.redL,   txt: DS.red   },
  CERRADO:     { label: 'Cerrado',       dot: DS.green, bg: DS.greenL, txt: DS.green },
}

export const AREA_COLOR = {
  Marcas: DS.purple, Societario: DS.blue, Laboral: DS.amber,
  Tributario: DS.green, Contratos: DS.slate, Consumidor: DS.inkM,
  Cobranza: DS.red, General: DS.slate,
}

export const AREA_ICON = {
  Marcas: 'M', Societario: 'S', Laboral: 'L', Tributario: 'T',
  Contratos: 'C', Consumidor: 'CO', Cobranza: 'CB', General: 'G',
}

export const CANAL_ICON = {
  'Web': 'ti-world',
  'WhatsApp': 'ti-brand-whatsapp',
  'Instagram DM': 'ti-brand-instagram',
}

export const ETAPAS_SOP = [
  'Intake','Diagnóstico','CLM/Firma','Ejecución',
  'Control','Cierre','Post-venta','Retro-loop',
]

export function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

export function fmtShort(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

export function horasLabel(h) {
  if (!h && h !== 0) return '—'
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`
}

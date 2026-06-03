import { useState, useEffect } from 'react'
import { useCasos }            from './hooks/useCasos'
import { usePlazos, useClientes, useMetricas } from './hooks/useData'
import Sidebar    from './components/ui/Sidebar'
import TopBar     from './components/ui/TopBar'
import Toast      from './components/ui/Toast'
import PantallaCasos    from './components/casos/PantallaCasos'
import PantallaPlazos   from './components/plazos/PantallaPlazos'
import PantallaClientes from './components/clientes/PantallaClientes'
import PantallaMetricas from './components/sistema/PantallaMetricas'
import PantallaAgentes  from './components/sistema/PantallaAgentes'

export default function App() {
  const [nav, setNav]     = useState('casos')
  const [toast, setToast] = useState(null)

  // Cargar fuentes en head
  useEffect(() => {
    if (document.querySelector('[data-per-fonts]')) return
    const link = document.createElement('link')
    link.setAttribute('data-per-fonts', '1')
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Outfit:wght@300;400;500;600;700;800&display=swap'
    link.rel  = 'stylesheet'
    document.head.appendChild(link)

    if (document.querySelector('[data-tabler]')) return
    const icons = document.createElement('link')
    icons.setAttribute('data-tabler', '1')
    icons.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css'
    icons.rel  = 'stylesheet'
    document.head.appendChild(icons)
  }, [])

  function showToast(msg, tipo = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3200)
  }

  // Hooks de datos reales
  const casosState    = useCasos()
  const plazosState   = usePlazos()
  const clientesState = useClientes()
  const metricasState = useMetricas()

  const urgentes = casosState.casos.filter(
    c => c.estado === 'ESCALADO' || c.estado === 'HITL'
  ).length

  return (
    <div style={{
      display: 'flex', height: '100vh', background: '#F5EFE4',
      fontFamily: "'Outfit', sans-serif", overflow: 'hidden',
    }}>
      <Toast toast={toast} />
      <Sidebar nav={nav} setNav={setNav} urgentes={urgentes} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <TopBar nav={nav} metricas={metricasState.metricas} />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {nav === 'casos'    && <PantallaCasos    {...casosState}    showToast={showToast} />}
          {nav === 'plazos'   && <PantallaPlazos   {...plazosState}   showToast={showToast} />}
          {nav === 'clientes' && <PantallaClientes {...clientesState} showToast={showToast} />}
          {nav === 'metricas' && <PantallaMetricas {...metricasState} />}
          {nav === 'sistema'  && <PantallaAgentes />}
          {(nav === 'rag' || nav === 'config') && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column', gap: 12, background: '#F5EFE4' }}>
              <i className="ti ti-tools" style={{ fontSize: 40, color: '#C4D0DC' }} />
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, color: '#8A9BAE' }}>
                Sección en construcción
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

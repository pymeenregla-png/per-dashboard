import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCasos() {
  const [casos, setCasos]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchCasos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: testData, error: testError } = await supabase
        .from('casos')
        .select('id, folio, area, estado, asunto, confianza_ia, sla_horas, ingresado_at, cliente_rut, contacto_nombre, contacto_email, contacto_tel, canal, agente_id, kit, etapa_sop, prioridad, resumen_ia, fuentes_rag, acciones_pendientes, documentos, nota_abogado, borrador_aprobado, plazo_critico, plazo_descripcion, n8n_execution_id, ultima_accion_at, cliente_id')
        .neq('estado', 'CERRADO')
        .order('ingresado_at', { ascending: true })

      if (testError) {
        setError('Error Supabase: ' + testError.message + ' | Code: ' + testError.code)
        setLoading(false)
        return
      }

      const casosConSLA = (testData || []).map(c => {
        const horas = Math.round((Date.now() - new Date(c.ingresado_at).getTime()) / 3600000)
        const pct   = (horas / c.sla_horas) * 100
        return {
          ...c,
          horas_transcurridas: horas,
          sla_pct: Math.min(Math.round(pct), 100),
          sla_estado: pct >= 100 ? 'VENCIDO' : pct >= 75 ? 'URGENTE' : 'EN_PLAZO',
          cliente_nombre: c.contacto_nombre || c.cliente_rut,
          cliente_tipo: null,
          cliente_suscripcion: false,
        }
      })

      setCasos(casosConSLA)
      setLoading(false)

    } catch (e) {
      setError('Error inesperado: ' + e.message)
      setLoading(false)
    }
  }, [])

  const fetchHistorial = useCallback(async (casoId) => {
    const { data, error } = await supabase
      .from('historial_casos')
      .select('*')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return data || []
  }, [])

  const actualizarEstado = useCallback(async (casoId, nuevoEstado, extras = {}) => {
    const { error } = await supabase
      .from('casos')
      .update({ estado: nuevoEstado, ultima_accion_at: new Date().toISOString(), ...extras })
      .eq('id', casoId)
    if (error) throw new Error(error.message)
    fetchCasos()
  }, [fetchCasos])

  const agregarHistorial = useCallback(async (casoId, actor, tipoActor, mensaje, metadata = {}) => {
    const { error } = await supabase
      .from('historial_casos')
      .insert({ caso_id: casoId, actor, tipo_actor: tipoActor, mensaje, metadata })
    if (error) throw new Error(error.message)
  }, [])

  const cerrarCaso = useCallback(async (casoId, notaAbogado, leccion) => {
    await actualizarEstado(casoId, 'CERRADO', {
      nota_abogado: notaAbogado,
      leccion_aprendida: leccion,
      retro_enviado: false,
    })
    await agregarHistorial(casoId, 'Abogado', 'abogado',
      'Caso cerrado.' + (leccion ? ' Lección enviada al RAG.' : ''))
  }, [actualizarEstado, agregarHistorial])

  const aprobarCaso = useCallback(async (casoId, nota) => {
    await actualizarEstado(casoId, 'EN_REVISION', { borrador_aprobado: true, nota_abogado: nota })
    await agregarHistorial(casoId, 'Abogado', 'abogado', 'Borrador aprobado. Enviado al cliente.')
  }, [actualizarEstado, agregarHistorial])

  const escalarCaso = useCallback(async (casoId, nota) => {
    await actualizarEstado(casoId, 'ESCALADO', { nota_abogado: nota })
    await agregarHistorial(casoId, 'Abogado', 'abogado', 'Caso escalado. Slack notificado.')
  }, [actualizarEstado, agregarHistorial])

  useEffect(() => {
    fetchCasos()
    const channel = supabase
      .channel('casos-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos' }, () => fetchCasos())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchCasos])

  return {
    casos, loading, error,
    fetchHistorial, actualizarEstado, agregarHistorial,
    cerrarCaso, aprobarCaso, escalarCaso,
    refetch: fetchCasos,
  }
}

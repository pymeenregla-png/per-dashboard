import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCasos() {
  const [casos, setCasos]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Cargar casos activos desde la vista
  const fetchCasos = useCallback(async () => {
    const { data, error } = await supabase
      .from('casos_activos')
      .select('*')

    if (error) { setError(error.message); return }
    setCasos(data || [])
    setLoading(false)
  }, [])

  // Cargar historial de un caso
  const fetchHistorial = useCallback(async (casoId) => {
    const { data, error } = await supabase
      .from('historial_casos')
      .select('*')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)
    return data || []
  }, [])

  // Actualizar estado de un caso
  const actualizarEstado = useCallback(async (casoId, nuevoEstado, extras = {}) => {
    const update = {
      estado: nuevoEstado,
      ultima_accion_at: new Date().toISOString(),
      ...extras,
    }
    const { error } = await supabase
      .from('casos')
      .update(update)
      .eq('id', casoId)

    if (error) throw new Error(error.message)
  }, [])

  // Agregar entrada al historial
  const agregarHistorial = useCallback(async (casoId, actor, tipoActor, mensaje, metadata = {}) => {
    const { error } = await supabase
      .from('historial_casos')
      .insert({ caso_id: casoId, actor, tipo_actor: tipoActor, mensaje, metadata })

    if (error) throw new Error(error.message)
  }, [])

  // Cerrar caso con lección aprendida
  const cerrarCaso = useCallback(async (casoId, notaAbogado, leccion) => {
    await actualizarEstado(casoId, 'CERRADO', {
      nota_abogado: notaAbogado,
      leccion_aprendida: leccion,
      retro_enviado: false,
    })
    await agregarHistorial(casoId, 'Abogado', 'abogado',
      'Caso cerrado por el abogado.' + (leccion ? ' Lección enviada al RAG.' : ''))
  }, [actualizarEstado, agregarHistorial])

  // Aprobar borrador
  const aprobarCaso = useCallback(async (casoId, nota) => {
    await actualizarEstado(casoId, 'EN_REVISION', {
      borrador_aprobado: true,
      nota_abogado: nota,
    })
    await agregarHistorial(casoId, 'Abogado', 'abogado',
      'Borrador aprobado. Documento enviado al cliente.')
  }, [actualizarEstado, agregarHistorial])

  // Escalar caso
  const escalarCaso = useCallback(async (casoId, nota) => {
    await actualizarEstado(casoId, 'ESCALADO', { nota_abogado: nota })
    await agregarHistorial(casoId, 'Abogado', 'abogado',
      'Caso escalado a equipo interno. Slack notificado.')
  }, [actualizarEstado, agregarHistorial])

  // Suscripción Realtime — el dashboard se actualiza solo
  useEffect(() => {
    fetchCasos()

    const channel = supabase
      .channel('casos-cambios')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casos' },
        () => fetchCasos()   // re-fetch cuando cambia cualquier caso
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchCasos])

  return {
    casos, loading, error,
    fetchHistorial,
    actualizarEstado,
    agregarHistorial,
    cerrarCaso,
    aprobarCaso,
    escalarCaso,
    refetch: fetchCasos,
  }
}

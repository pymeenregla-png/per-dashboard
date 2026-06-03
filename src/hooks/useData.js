import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Hook: plazos legales ──────────────────────────────────────
export function usePlazos() {
  const [plazos, setPlazos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchPlazos = useCallback(async () => {
    const { data, error } = await supabase
      .from('agenda_plazos')
      .select('*')

    if (error) { setError(error.message); return }
    setPlazos(data || [])
    setLoading(false)
  }, [])

  const marcarCumplido = useCallback(async (plazoId) => {
    const { error } = await supabase
      .from('plazos_legales')
      .update({ estado: 'cumplido' })
      .eq('id', plazoId)

    if (error) throw new Error(error.message)
    fetchPlazos()
  }, [fetchPlazos])

  useEffect(() => {
    fetchPlazos()

    const channel = supabase
      .channel('plazos-cambios')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'plazos_legales' },
        () => fetchPlazos()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchPlazos])

  return { plazos, loading, error, marcarCumplido, refetch: fetchPlazos }
}

// ── Hook: clientes ────────────────────────────────────────────
export function useClientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetchClientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) { setError(error.message); return }
    setClientes(data || [])
    setLoading(false)
  }, [])

  // Casos de un cliente específico
  const fetchCasosCliente = useCallback(async (clienteId) => {
    const { data, error } = await supabase
      .from('casos')
      .select('id, folio, area, estado, asunto, confianza_ia, ingresado_at')
      .eq('cliente_id', clienteId)
      .order('ingresado_at', { ascending: false })

    if (error) throw new Error(error.message)
    return data || []
  }, [])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  return { clientes, loading, error, fetchCasosCliente, refetch: fetchClientes }
}

// ── Hook: métricas ────────────────────────────────────────────
export function useMetricas() {
  const [metricas, setMetricas] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function fetchMetricas() {
      // Casos activos por estado
      const { data: porEstado } = await supabase
        .from('casos')
        .select('estado')
        .neq('estado', 'CERRADO')

      // Total casos
      const { count: total } = await supabase
        .from('casos')
        .select('*', { count: 'exact', head: true })

      // Plazos críticos (≤7 días)
      const hoy = new Date()
      const en7 = new Date(hoy); en7.setDate(hoy.getDate() + 7)
      const { count: plazosCriticos } = await supabase
        .from('plazos_legales')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente')
        .lte('fecha_vence', en7.toISOString().split('T')[0])

      // Total clientes
      const { count: totalClientes } = await supabase
        .from('clientes')
        .select('*', { count: 'exact', head: true })

      // RAG stats
      const { count: ragChunks } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })

      const estados = porEstado || []
      setMetricas({
        casosActivos:    estados.length,
        hitlPendientes:  estados.filter(c => c.estado === 'HITL').length,
        escalados:       estados.filter(c => c.estado === 'ESCALADO').length,
        enRevision:      estados.filter(c => c.estado === 'EN_REVISION').length,
        total:           total || 0,
        plazosCriticos:  plazosCriticos || 0,
        totalClientes:   totalClientes || 0,
        ragChunks:       ragChunks || 0,
      })
      setLoading(false)
    }
    fetchMetricas()
  }, [])

  return { metricas, loading }
}

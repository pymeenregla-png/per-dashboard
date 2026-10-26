import { createClient } from '@supabase/supabase-js'

// Conexión del dashboard PER a Supabase.
// La llave publicable es pública por diseño: no da acceso por sí sola.
// El acceso real lo decide la sesión de Clerk del abogado (token con role y email),
// que Supabase verifica en cada consulta mediante las reglas RLS de la base.
const supabaseUrl = 'https://kwyicmnbquqpuoxmsxgt.supabase.co'
const supabaseKey = 'sb_publishable_om3LXIMnPP1Zmznix4Di6Q_7htjvZkz'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  // Entrega a Supabase el token de sesión vigente de Clerk (null si no hay sesión).
  accessToken: async () => {
    try {
      return (await window.Clerk?.session?.getToken()) ?? null
    } catch {
      return null
    }
  },
  realtime: { params: { eventsPerSecond: 10 } },
})

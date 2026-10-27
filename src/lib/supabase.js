import { createClient } from '@supabase/supabase-js'

// Conexión del dashboard PER a Supabase.
// La llave publicable es pública por diseño: no da acceso por sí sola.
// El acceso real lo decide la sesión de Clerk del abogado (token con role y email),
// que Supabase verifica en cada consulta mediante las reglas RLS de la base.
const supabaseUrl = 'https://kwyicmnbquqpuoxmsxgt.supabase.co'
const supabaseKey = 'sb_publishable_om3LXIMnPP1Zmznix4Di6Q_7htjvZkz'

// Espera hasta 5 segundos a que Clerk termine de cargar la sesión,
// para que la primera consulta al abrir el panel ya vaya autenticada.
async function esperarClerk() {
  for (let i = 0; i < 50; i++) {
    if (window.Clerk && window.Clerk.loaded) return
    await new Promise((r) => setTimeout(r, 100))
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  accessToken: async () => {
    try {
      await esperarClerk()
      return (await window.Clerk?.session?.getToken()) ?? null
    } catch {
      return null
    }
  },
  realtime: { params: { eventsPerSecond: 10 } },
})

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase is not configured. Copy .env.example to .env and fill in ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart `npm run dev`.'
  )
}

export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

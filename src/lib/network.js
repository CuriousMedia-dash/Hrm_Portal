import { supabase } from './supabaseClient.js'

/**
 * Ask the database whether this browser is on an approved network.
 * The database decides — this is only so the portal can explain itself
 * before someone clicks a button that would fail.
 */
export async function fetchNetworkStatus() {
  const { data, error } = await supabase.rpc('network_status')
  if (error) {
    // the migration may not be installed yet; don't block anyone over it
    return { ip: null, allowed: true, configured: false, unknown: true }
  }
  const status = { unknown: false, ...(data || {}) }
  // Postgres hands back an inet, which can carry a /32 it does not need.
  // Strip it so the address reads cleanly and nothing doubles it up later.
  if (typeof status.ip === 'string') status.ip = status.ip.replace(/\/\d+$/, '')
  return status
}

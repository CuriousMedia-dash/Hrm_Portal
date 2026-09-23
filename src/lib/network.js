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
  return { unknown: false, ...(data || {}) }
}

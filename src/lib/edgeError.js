/**
 * Pull the real reason out of an Edge Function failure.
 *
 * supabase-js turns any non-2xx into a FunctionsHttpError whose message is
 * the useless "Edge Function returned a non-2xx status code". The message we
 * actually sent is in the response body, hanging off err.context — so read
 * that first and only fall back to the generic text.
 */
export async function edgeErrorMessage(err, fallback = 'The request failed.') {
  if (!err) return fallback

  try {
    const res = err.context
    if (res && typeof res.clone === 'function') {
      const body = await res.clone().json()
      if (body?.error) return body.error
      if (body?.message) return body.message
    }
  } catch {
    // body was not JSON, or was already consumed — fall through
  }

  const raw = err.message || ''
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Could not reach the server. Check the connection and try again.'
  }
  if (/not found|404/i.test(raw)) {
    return 'The create-employee-login function is not deployed. Run: supabase functions deploy create-employee-login'
  }
  if (/non-2xx/i.test(raw)) {
    return 'The server rejected the request but gave no reason. Check the function logs in Supabase.'
  }
  return raw || fallback
}

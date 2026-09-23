// =====================================================================
// create-employee-login
//
// Creates a Supabase Auth account for an existing employee record, with
// a password the super admin chooses, and links the two.
//
// This has to run server-side: it uses the service_role key, which must
// never reach a browser. The function checks the caller's JWT and
// refuses anyone who is not a super admin.
//
// Deploy:  supabase functions deploy create-employee-login
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Function is missing its Supabase credentials.' }, 500)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // ---- who is asking -------------------------------------------------
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!jwt) return json({ error: 'Not signed in.' }, 401)

  const { data: caller, error: callerError } = await admin.auth.getUser(jwt)
  if (callerError || !caller?.user) return json({ error: 'Not signed in.' }, 401)

  const { data: me } = await admin
    .from('employees').select('role, full_name').eq('user_id', caller.user.id).maybeSingle()

  if (me?.role !== 'super_admin') {
    return json({ error: 'Only a super admin can create logins.' }, 403)
  }

  // ---- what they asked for -------------------------------------------
  let body: { employee_id?: string; email?: string; password?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Could not read the request.' }, 400)
  }

  const employeeId = (body.employee_id ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const action = body.action ?? 'create'

  if (!employeeId) return json({ error: 'Which employee?' }, 400)
  if (!email || !email.includes('@')) return json({ error: 'A valid email is required.' }, 400)
  if (password.length < 8) return json({ error: 'The password must be at least 8 characters.' }, 400)

  const { data: employee, error: employeeError } = await admin
    .from('employees').select('id, full_name, user_id, email').eq('id', employeeId).maybeSingle()

  if (employeeError || !employee) return json({ error: 'That employee record no longer exists.' }, 404)

  // ---- reset an existing login ---------------------------------------
  if (action === 'reset') {
    if (!employee.user_id) return json({ error: 'This employee has no login to reset.' }, 400)
    const { error } = await admin.auth.admin.updateUserById(employee.user_id, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true, action: 'reset', email: employee.email, full_name: employee.full_name })
  }

  // ---- create a new login --------------------------------------------
  if (employee.user_id) {
    return json({ error: `${employee.full_name} already has a login. Reset the password instead.` }, 409)
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,                       // no inbox round-trip
    user_metadata: { full_name: employee.full_name }
  })

  if (createError) {
    const taken = /already|registered|exists/i.test(createError.message)
    return json({
      error: taken
        ? `${email} already has an account. Link it in SQL, or use a different address.`
        : createError.message
    }, 400)
  }

  // The signup trigger may have made a second record for this new user.
  // Remove it, then attach the login to the record HR actually filled in.
  await admin.from('employees').delete().eq('user_id', created.user.id).neq('id', employee.id)

  const { error: linkError } = await admin
    .from('employees')
    .update({
      user_id: created.user.id,
      email,
      status: employee.status === 'pending' ? 'active' : employee.status
    })
    .eq('id', employee.id)

  if (linkError) {
    // don't leave an orphan account behind
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: linkError.message }, 400)
  }

  return json({
    ok: true,
    action: 'created',
    email,
    full_name: employee.full_name
  })
})

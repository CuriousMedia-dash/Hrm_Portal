# create-employee-login

Lets a super admin create an employee's login, with a password they choose,
straight from the portal — no self-signup, no confirmation email.

## Why it exists

Creating an auth account needs the `service_role` key. Anything in a `VITE_`
variable ships to the browser, where that key would give anyone full access to
the database. So the work happens here instead, and the function refuses any
caller who is not a super admin.

## Deploy

```bash
npm install -g supabase          # once
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy create-employee-login
```

`<your-project-ref>` is in your Supabase URL: `https://<ref>.supabase.co`.

No secrets to set — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided
to Edge Functions automatically.

## Check it deployed

Supabase Dashboard → Edge Functions → `create-employee-login` should be listed
and show invocations once you use it.

## What it does

- **create** — makes the auth account with `email_confirm: true` (so they can
  sign in immediately), deletes any duplicate record the signup trigger made,
  and links the login to the employee record HR filled in.
- **reset** — sets a new password on an existing login.

If linking fails, the newly created account is deleted again rather than left
orphaned.

import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useToast } from './Toast.jsx'
import Modal from './Modal.jsx'
import Icon from './Icon.jsx'

/** Readable but not guessable: no ambiguous characters, always mixed. */
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'      // no I or O
  const lower = 'abcdefghijkmnopqrstuvwxyz'     // no l
  const digits = '23456789'                     // no 0 or 1
  const symbols = '@#$%&*'
  const all = upper + lower + digits + symbols
  const pick = (set) => set[Math.floor(Math.random() * set.length)]

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < 12) chars.push(pick(all))

  // shuffle so the guaranteed characters are not always in front
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = chars[i]
    chars[i] = chars[j]
    chars[j] = swap
  }
  return chars.join('')
}

/**
 * Creates the Supabase Auth account for an employee, with a password the
 * super admin sets. The work happens in the create-employee-login Edge
 * Function, because it needs the service_role key.
 */
export default function LoginCredentials({ employee, mode = 'create', onClose, onDone }) {
  const toast = useToast()
  const [email, setEmail] = useState(employee.email || '')
  const [password, setPassword] = useState(generatePassword)
  const [show, setShow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const isReset = mode === 'reset'

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (!isReset && (!email.trim() || !email.includes('@'))) {
      setError('A work email is required — it is what they sign in with.')
      return
    }
    if (password.length < 8) {
      setError('The password must be at least 8 characters.')
      return
    }

    setBusy(true)
    const { data, error: fnError } = await supabase.functions.invoke('create-employee-login', {
      body: {
        employee_id: employee.id,
        email: email.trim().toLowerCase(),
        password,
        action: isReset ? 'reset' : 'create'
      }
    })
    setBusy(false)

    if (fnError) {
      setError(
        /not found|404|failed to fetch/i.test(fnError.message)
          ? 'The create-employee-login function is not deployed yet. See supabase/functions/create-employee-login/README.md.'
          : fnError.message
      )
      return
    }
    if (data?.error) { setError(data.error); return }

    setDone(true)
    toast.success(isReset ? 'Password reset.' : `Login created for ${employee.full_name}.`)
  }

  async function copyAll() {
    const text = `HRM Portal\nEmail: ${email}\nPassword: ${password}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Credentials copied.')
    } catch {
      toast.error('Could not copy — select the text manually.')
    }
  }

  if (done) {
    return (
      <Modal title="Login ready" subtitle={employee.full_name} onClose={() => { onDone?.(); onClose() }}>
        <div className="alert alert-good">
          <Icon name="checkCircle" size={16} />
          <span>
            {isReset
              ? 'The password has been changed.'
              : 'The account is created and linked to this employee record. They can sign in straight away — no confirmation email.'}
          </span>
        </div>

        <div className="cred-box">
          <div>
            <span className="cred-label">Email</span>
            <strong>{email}</strong>
          </div>
          <div>
            <span className="cred-label">Password</span>
            <strong className="mono">{password}</strong>
          </div>
        </div>

        <p className="dim" style={{ fontSize: '.82rem' }}>
          Copy this now — the password is not stored anywhere readable and cannot be
          shown again. If it is lost, reset it from here.
        </p>

        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={copyAll}>
            <Icon name="paperclip" size={14} /> Copy credentials
          </button>
          <button type="button" className="btn" onClick={() => { onDone?.(); onClose() }}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={isReset ? `Reset password for ${employee.full_name}` : `Create login for ${employee.full_name}`}
      subtitle={isReset ? undefined : 'They can sign in immediately with these details'}
      onClose={onClose}
    >
      {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="cred_email">Work email</label>
          <input id="cred_email" type="email" value={email} disabled={isReset}
            onChange={(e) => setEmail(e.target.value)} placeholder="name@curiousmedia.in" required />
          {!isReset && <span className="hint">This becomes their username, and links the login to this record.</span>}
        </div>

        <div className="field">
          <label htmlFor="cred_password">Password</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="cred_password" type={show ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} className="mono" required />
            <button type="button" className="btn btn-2" onClick={() => setShow((v) => !v)} title="Show or hide">
              <Icon name="eye" size={15} />
            </button>
            <button type="button" className="btn btn-2" onClick={() => setPassword(generatePassword())}>
              Generate
            </button>
          </div>
          <span className="hint">Hand this to them; they can change it later under My profile.</span>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>
            {busy && <span className="spinner" />} {isReset ? 'Reset password' : 'Create login'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

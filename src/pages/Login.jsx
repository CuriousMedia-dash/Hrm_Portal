import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import Icon from '../components/Icon.jsx'

const POINTS = [
  'One directory for every person at Curious Media',
  'Attendance that takes two taps a day',
  'Leave requests and approvals, with balances that keep themselves'
]

export default function Login() {
  const { session, signIn, signUp, configured } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={location.state?.from || '/'} replace />

  const isSignup = mode === 'signup'

  async function handleSubmit(event) {
    event.preventDefault()
    setError(''); setNotice('')

    if (!configured) { setError('Supabase keys are missing. Fill in .env and restart the dev server.'); return }
    if (isSignup && fullName.trim().length < 2) { setError('Please enter your full name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setBusy(true)
    try {
      if (!isSignup) {
        const { error: signInError } = await signIn(email, password)
        if (signInError) {
          setError(
            signInError.message === 'Invalid login credentials'
              ? 'That email and password combination did not work.'
              : signInError.message
          )
        }
      } else {
        const { data, error: signUpError } = await signUp(email, password, fullName)
        if (signUpError) setError(signUpError.message)
        else if (data?.session) setNotice('Account created — taking you in.')
        else {
          setNotice('Account created. Check your inbox to confirm your email, then sign in.')
          setMode('signin')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth-art">
        <span className="logo">CM</span>
        <div>
          <h2>Everything HR, in one place.</h2>
          <p>The internal people platform for Curious Media — directory, attendance and leave.</p>
          <div className="auth-points">
            {POINTS.map((point) => (
              <div className="auth-point" key={point}>
                <span className="tick"><Icon name="check" size={13} strokeWidth={2.6} /></span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="auth-foot">Curious Media · internal use only</p>
      </aside>

      <section className="auth-form">
        <div className="auth-box">
          <div className="mini-brand">
            <span className="logo">CM</span>
            <strong>HRM Portal</strong>
          </div>

          <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="lead">
            {isSignup
              ? 'Use the work email HR has on file for you.'
              : 'Sign in with your Curious Media email to continue.'}
          </p>

          {error && <div className="alert alert-bad"><Icon name="alert" size={16} /><span>{error}</span></div>}
          {notice && <div className="alert alert-good"><Icon name="checkCircle" size={16} /><span>{notice}</span></div>}

          <form onSubmit={handleSubmit}>
            {isSignup && (
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name" placeholder="Vihith Reddy" required />
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" placeholder="you@curiousmedia.in" required />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  style={{ paddingRight: 40 }}
                  required
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{ position: 'absolute', right: 2, top: 1, width: 32, height: 32 }}
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  <Icon name="eye" size={16} />
                </button>
              </div>
              {isSignup && <span className="hint">At least 8 characters.</span>}
            </div>

            <button type="submit" className="btn btn-block" disabled={busy} style={{ marginTop: 4 }}>
              {busy ? <><span className="spinner" /> Please wait…</>
                    : <><Icon name={isSignup ? 'sparkle' : 'login'} size={16} /> {isSignup ? 'Create account' : 'Sign in'}</>}
            </button>
          </form>

          <p className="auth-switch">
            {isSignup ? 'Already registered? ' : 'First time here? '}
            <button type="button" className="link-btn"
              onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(''); setNotice('') }}>
              {isSignup ? 'Sign in instead' : 'Create an account'}
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}

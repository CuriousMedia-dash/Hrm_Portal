import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Icon from './Icon.jsx'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItems((list) => [...list, { id, message, kind }])
    setTimeout(() => dismiss(id), kind === 'err' ? 6500 : 4000)
  }, [dismiss])

  const api = useMemo(() => ({
    success: (m) => push(m, 'ok'),
    error: (m) => push(m || 'Something went wrong.', 'err'),
    info: (m) => push(m, 'info')
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div className={`toast ${t.kind}`} key={t.id}>
            <span className="ico">
              <Icon name={t.kind === 'ok' ? 'checkCircle' : t.kind === 'err' ? 'alert' : 'info'} size={17} />
            </span>
            <span className="msg">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

import { useEffect } from 'react'
import Icon from './Icon.jsx'

export default function Modal({ title, subtitle, onClose, children, wide = false, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={17} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer}
      </div>
    </div>
  )
}

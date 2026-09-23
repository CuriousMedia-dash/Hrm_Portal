import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

/**
 * A day-first date box: you type 23-07-2004, the way dates are written here.
 *
 * The native <input type="date"> renders in the browser's own locale, so on a
 * machine set to US English it asks for the month first and simply refuses a
 * first segment of 23. This component takes plain typing, inserts the dashes
 * itself, and still hands the parent the ISO YYYY-MM-DD that Postgres wants —
 * so it is a drop-in swap for the native control.
 *
 * The calendar icon is a real native date input laid over the button at zero
 * opacity, which is the one reliable way to open the browser's own picker.
 */

export function isoToDisplay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

export function displayToISO(text) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text || '')
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2999) return null
  // rejects 31-02-2024 and friends
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null
  }
  return `${m[3]}-${m[2]}-${m[1]}`
}

function mask(digits) {
  const d = digits.slice(0, 8)
  let out = d.slice(0, 2)
  if (d.length > 2) out += `-${d.slice(2, 4)}`
  if (d.length > 4) out += `-${d.slice(4, 8)}`
  return out
}

export default function DateField({
  id, value, onChange, min, max,
  required = false, disabled = false, autoFocus = false
}) {
  const [draft, setDraft] = useState(() => isoToDisplay(value))
  const typing = useRef(false)

  // follow the parent when it loads a record or clears the form
  useEffect(() => {
    if (!typing.current) setDraft(isoToDisplay(value))
  }, [value])

  const emit = (iso) => onChange?.({ target: { value: iso } })

  const inRange = (iso) => (!min || iso >= min) && (!max || iso <= max)

  function handleType(event) {
    // re-masking the digits is all it takes: backspacing over a trailing dash
    // drops the dash and the digit before it together, in one keypress
    const digits = event.target.value.replace(/\D/g, '')
    const next = mask(digits)
    setDraft(next)

    if (!digits.length) { emit(''); return }
    const iso = displayToISO(next)
    if (iso && inRange(iso)) emit(iso)
  }

  function handleBlur() {
    typing.current = false
    const digits = draft.replace(/\D/g, '')
    if (!digits.length) { setDraft(''); emit(''); return }

    const iso = displayToISO(draft)
    if (iso && inRange(iso)) { setDraft(isoToDisplay(iso)); emit(iso); return }
    setDraft(isoToDisplay(value))   // half-typed or impossible — snap back to the last good date
  }

  return (
    <div className="datefield">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd-mm-yyyy"
        value={draft}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        onFocus={() => { typing.current = true }}
        onChange={handleType}
        onBlur={handleBlur}
      />
      <span className="datefield-pick" aria-hidden="true">
        <Icon name="calendar" size={15} />
        <input
          type="date"
          tabIndex={-1}
          value={value || ''}
          min={min}
          max={max}
          disabled={disabled}
          aria-label="Open calendar"
          onChange={(e) => { setDraft(isoToDisplay(e.target.value)); emit(e.target.value) }}
        />
      </span>
    </div>
  )
}

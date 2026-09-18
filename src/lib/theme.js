const KEY = 'hrm-theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

export function applyTheme(choice) {
  const dark = choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try { localStorage.setItem(KEY, choice) } catch { /* private mode */ }
}

/** Keep "system" in sync when the OS flips theme while the app is open. */
export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => { if (getTheme() === 'system') applyTheme('system') }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

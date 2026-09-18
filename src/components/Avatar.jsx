import { initials } from '../lib/format.js'

/** Same name always gets the same colour, so people are recognisable at a glance. */
function hueIndex(seed = '') {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  return hash % 8
}

export default function Avatar({ name = '', size = 'md' }) {
  const cls = size === 'sm' ? 'avatar avatar-sm' : size === 'lg' ? 'avatar avatar-lg' : 'avatar'
  return <span className={`${cls} av-${hueIndex(name)}`} title={name}>{initials(name)}</span>
}

/**
 * The document set every employee is asked for.
 * `required: false` means HR will not chase it — the rest block completion.
 */
export const DOC_TYPES = [
  { value: 'tenth_marksheet',  label: '10th mark sheet',      group: 'Education',  required: true,
    hint: 'Class 10 marks card or certificate' },
  { value: 'twelfth_marksheet', label: '12th mark sheet',     group: 'Education',  required: true,
    hint: 'Class 12 / diploma marks card' },
  { value: 'ug_marksheet',     label: 'UG mark sheet',        group: 'Education',  required: true,
    hint: 'Degree certificate or consolidated marks card' },
  { value: 'pg_marksheet',     label: 'PG mark sheet',        group: 'Education',  required: true,
    hint: 'Post-graduate certificate or marks card' },

  { value: 'photo',            label: 'Passport size photo',  group: 'Identity',   required: true,
    hint: 'Recent photograph, plain background (JPG or PNG)' },
  { value: 'pan_card',         label: 'PAN card',             group: 'Identity',   required: true,
    hint: 'Clear copy of both sides if applicable' },
  { value: 'aadhaar_card',     label: 'Aadhaar card',         group: 'Identity',   required: true,
    hint: 'Front and back in one file' },
  { value: 'guardian_aadhaar', label: "Guardian's Aadhaar",   group: 'Identity',   required: true,
    hint: "Mother's or father's Aadhaar card" },

  { value: 'bank_proof',       label: 'Bank account proof',   group: 'Banking',    required: true,
    hint: 'Passbook front page or a cancelled cheque' },

  { value: 'relieving_letter', label: 'Relieving letter',     group: 'Previous employment', required: false,
    hint: 'From your previous employer, if applicable' },
  { value: 'previous_offer_letter', label: 'Previous offer letter', group: 'Previous employment', required: false,
    hint: 'Proof of last drawn compensation, if applicable' }
]

export const DOC_GROUPS = [...new Set(DOC_TYPES.map((d) => d.group))]

export const docLabel = (value) =>
  DOC_TYPES.find((d) => d.value === value)?.label ?? value

export const REQUIRED_DOCS = DOC_TYPES.filter((d) => d.required)

export const RELATIONSHIPS = [
  { value: 'mother',   label: 'Mother' },
  { value: 'father',   label: 'Father' },
  { value: 'sibling',  label: 'Sibling' },
  { value: 'spouse',   label: 'Spouse' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other',    label: 'Other' }
]

export const BUCKET = 'employee-documents'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp'
export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}

/** Storage path: the first folder is the employee id, which is what the storage policies check. */
export function buildPath(employeeId, docType, fileName) {
  const ext = (fileName.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${employeeId}/${docType}-${Date.now()}.${ext}`
}

/** How far along a person is, counting only the documents HR insists on. */
export function completionOf(documents) {
  const have = new Set(documents.map((d) => d.doc_type))
  const done = REQUIRED_DOCS.filter((d) => have.has(d.value)).length
  return { done, total: REQUIRED_DOCS.length, pct: Math.round((done / REQUIRED_DOCS.length) * 100) }
}

/* ------------------------------------------------------------------ */
/* The document wallet — what the company issues TO an employee        */
/* ------------------------------------------------------------------ */

export const ISSUED_TYPES = [
  { value: 'offer_letter',           label: 'Offer letter',           icon: 'mail' },
  { value: 'appointment_letter',     label: 'Appointment letter',     icon: 'checkCircle' },
  { value: 'insurance',              label: 'Insurance documents',    icon: 'shield' },
  { value: 'payslip',                label: 'Salary payslip',         icon: 'wallet',  recurring: true },
  { value: 'completion_certificate', label: 'Completion certificate', icon: 'gift' },
  { value: 'recommendation_letter',  label: 'Letter of recommendation', icon: 'sparkle' },
  { value: 'other',                  label: 'Other document',         icon: 'inbox' }
]

export const issuedLabel = (value) =>
  ISSUED_TYPES.find((t) => t.value === value)?.label ?? value

export const isRecurring = (value) =>
  Boolean(ISSUED_TYPES.find((t) => t.value === value)?.recurring)

/** Wallet files live under <employee_id>/issued/ so storage policies can protect them. */
export function issuedPath(employeeId, docType, fileName) {
  const ext = (fileName.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${employeeId}/issued/${docType}-${Date.now()}.${ext}`
}

/** "September 2026" from "2026-09". */
export function periodLabel(period) {
  if (!period) return null
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return new Date(year, month - 1, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

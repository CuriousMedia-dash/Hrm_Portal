/**
 * Company policy documents — the same set for everybody, uploaded by HR.
 * Anything not in this list can still be added as "Other".
 */
export const POLICY_KINDS = [
  { value: 'late_policy',      label: 'Late policy',
    hint: 'Grace period, how lates are counted, what happens after a threshold' },
  { value: 'leave_policy',     label: 'Leave policy',
    hint: 'Entitlements, notice, approvals and carry-forward' },
  { value: 'confidentiality',  label: 'Confidentiality clause',
    hint: 'What may not leave the company, and for how long' },
  { value: 'code_of_conduct',  label: 'Code of conduct',
    hint: 'Behaviour expected of everyone at work' },
  { value: 'posh',             label: 'Prevention of sexual harassment',
    hint: 'The POSH policy and how to raise a complaint' },
  { value: 'wfh_policy',       label: 'Work from home policy',
    hint: 'When remote work is allowed and what is expected' },
  { value: 'expense_policy',   label: 'Expense and reimbursement policy',
    hint: 'What can be claimed, limits and receipts' },
  { value: 'exit_policy',      label: 'Exit and notice policy',
    hint: 'Notice period, handover and the final settlement' },
  { value: 'other',            label: 'Other',
    hint: 'Anything else the team should have on file' }
]

export const policyLabel = (value) =>
  POLICY_KINDS.find((k) => k.value === value)?.label ?? value

export const POLICY_BUCKET = 'company-policies'
export const POLICY_MAX_BYTES = 20 * 1024 * 1024
export const POLICY_ACCEPTED = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
export const POLICY_ACCEPTED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png'
]

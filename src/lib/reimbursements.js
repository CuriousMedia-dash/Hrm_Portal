export const EXPENSE_CATEGORIES = [
  { value: 'travel',               label: 'Travel' },
  { value: 'food',                 label: 'Food & meals' },
  { value: 'accommodation',        label: 'Accommodation' },
  { value: 'phone_internet',       label: 'Phone & internet' },
  { value: 'office_supplies',      label: 'Office supplies' },
  { value: 'client_entertainment', label: 'Client entertainment' },
  { value: 'software',             label: 'Software & subscriptions' },
  { value: 'other',                label: 'Other' }
]

export const CLAIM_STATUSES = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'paid',     label: 'Paid' }
]

/** Indian rupee formatting, no decimals unless there are paise. */
export function formatMoney(amount) {
  const n = Number(amount || 0)
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })
}

export function receiptPath(employeeId, fileName) {
  const ext = (fileName.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${employeeId}/receipts/${Date.now()}.${ext}`
}

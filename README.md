# HRM Portal — Curious Media

Internal HR portal: employee directory, attendance and leave, with HR-admin and
employee roles. React + Vite on the front, Supabase (Postgres + Auth + row level
security) as the backend.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**. Pick a region close
   to you (Mumbai / Singapore) and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and run it.
   This creates the tables, the row-level-security policies and the signup trigger.
   It is safe to re-run.
3. *(Optional)* Run `supabase/seed_sample_data.sql` to get five sample employees
   so the directory is not empty while you build.
4. **Auth settings** (Authentication → Providers → Email): for internal use, turn
   **"Confirm email"** off so people can sign in immediately. Leave it on if you
   want inbox verification — then everyone has to click the emailed link first.

## 2. Point the app at your project

```bash
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux
```

Fill in both values from **Supabase → Project Settings → API**:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

The anon key is meant to be public — every rule that protects data lives in the
RLS policies in `schema.sql`. Never put the **service_role** key in this file.

## 3. Run it

```bash
npm install
npm run dev
```

Opens on <http://localhost:5173>.

## 4. Make yourself the HR admin

1. In the app, click **Sign up** and register with your work email.
2. In Supabase → SQL Editor, run `supabase/make_admin.sql` (edit the email in it
   first if it is not `growth@curiousmedia.in`).
3. Refresh the portal. You now see the Employees "Add employee" button, the team
   roster and the leave approvals tab.

---

## How access works

| | Employee | Manager | HR admin |
|---|---|---|---|
| Directory | own record only | own department, read-only | everyone, read + write |
| Own profile | contact details only | contact details only | anything |
| Attendance | check in/out, see own history | see + mark own department | mark anyone, any date, export |
| Leave | apply, withdraw while pending | approve / reject own department | approve / reject everyone |
| Leave balances | see own | — | set anyone's |
| Reimbursements | raise / withdraw own claims | — | approve, reject, mark paid |
| Documents | upload / replace / delete own | — | view everyone's |
| Emergency contacts | manage own | — | view everyone's |

The database enforces this, not the UI. An employee who fiddles with the browser
still cannot read the directory or someone else's attendance — the policies in `schema.sql` block
it at the Postgres level. A `before update` trigger also stops employees from
promoting themselves to `hr_admin` or editing their own department or joining date.

**How people get access:** HR adds the employee (with their work email) in the
Employees tab, the person signs up with that same email, and the signup trigger
links the two automatically. If someone signs up before HR adds them, they get a
`pending` record that HR can fill in later.

## Creating logins from the portal

A super admin can create an employee's account with a password they choose —
no self-signup, no confirmation email.

**Employees → a person → Create login**, or it opens automatically right after
you add a new employee. Set or generate a password, and the dialog shows the
credentials once so you can copy and hand them over. For someone who already
has an account the same button reads **Reset password**.

This needs the Edge Function deployed once:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy create-employee-login
```

**Why a function rather than doing it in the app:** creating an auth account
requires the `service_role` key, which would be readable by anyone if it shipped
in a `VITE_` variable. The function holds it server-side, checks the caller's JWT,
and refuses anyone who is not a super admin.

It also cleans up after itself: if the signup trigger has already made a stray
record for that email it is removed, and if linking fails the new account is
deleted rather than left orphaned.

Passwords are never stored anywhere readable — the dialog is the only time it is
shown. Lost ones are replaced, not recovered.

## Document wallet

Two document flows, in opposite directions:

| | Who uploads | Who reads | Where |
|---|---|---|---|
| **Submitted documents** | the employee | employee + HR | My profile |
| **Document wallet** | HR | the employee + HR | My profile (read-only) and Employees → person |

The wallet holds what the company issues: offer letter, appointment letter,
insurance, payslips, completion certificate, letter of recommendation. HR
uploads from **Employees → a person → Document wallet → Issue document**; the
employee sees them under **My profile → My documents from HR** and can download
but never add or delete.

Payslips recur, so the wallet allows many files per type, each tagged with its
month. Everything else is normally one file.

**Managers cannot see a wallet** — payslips are salary information, so access is
the employee themselves plus HR, and nobody else.

Files live at `<employee_id>/issued/` in the same private bucket. The storage
policies carve out that `issued` subfolder as read-only to everyone but HR, so an
employee cannot delete their own payslip even by calling the API directly.

## Documents & emergency contacts

Each employee uploads their own paperwork from **My profile**. Files go to a
**private** Supabase Storage bucket (`employee-documents`); the `employee_documents`
table records which file is which. Nobody can reach a file by URL — the app mints
a signed link valid for two minutes when you click View.

Required: 10th, 12th, UG and PG mark sheets, passport photo, PAN, Aadhaar,
guardian's Aadhaar, bank proof (passbook front page or cancelled cheque).
Optional: relieving letter and previous offer letter.

Two emergency contacts are required, stored as data (name, relationship, phone)
rather than as a document.

To change the list, edit `src/lib/documents.js` — add or remove an entry in
`DOC_TYPES`, flip `required` — and add the same `doc_type` value to the check
constraint in `supabase/schema.sql`.

HR sees everything: open **Employees → a person** and their documents and
contacts are at the bottom of the panel, view-only.

## Loading the directory in bulk

The portal reads the `employees` table live, so anything inserted in Supabase
shows up on the next page load — there is no import step in the app and nothing
to sync.

Two ways to load a lot of people at once:

**SQL** — `supabase/import_employees.sql` holds the directory: name, department,
designation, employment type, date of birth, status. Run
`supabase/allow_null_email.sql` once first, because those records carry no email
address and the column is NOT NULL until you do.

An employee record without an email is directory-only: it shows in the list,
counts in headcount, and feeds birthday alerts, but no signup can link to it.
Add the email (Employees → Edit) when that person needs portal access.

**CSV** — Supabase → Table Editor → `employees` → **Insert → Import data from CSV**,
using `supabase/import_employees_template.csv`, which holds the same 27 rows.
Leave `id`, `user_id` and `role` out; the database fills them.

`date_of_birth` is what the birthday notifications read; only the day and month
matter, so a placeholder year is fine. Each person with an email still signs up
themselves (or you create their login under Authentication → Users); the signup
links to their row by email.

## Notifications

The bell in the top bar collects whatever needs attention, refreshing every five
minutes and whenever it is opened.

HR sees pending leave requests, pending reimbursement claims, and birthdays in
the next 7 days (from the `upcoming_birthdays()` function, which ignores the
year and handles the December → January wrap).

Employees see the state of their own requests, plus a nudge for any missing
required document or emergency contact. They never see anyone else's data —
the row-level security would not return it even if the panel asked.

## The four tiers

| Tier | Set by | What it adds |
|---|---|---|
| **Super admin** | `role = 'super_admin'` | Everything HR has, plus granting roles, deleting employees, and the company-wide Activity page |
| **HR admin / Manager** | `role = 'hr_admin'` / `'manager'` | Their own attendance and leave like anyone else, plus approvals — HR for everyone, a manager for their own department |
| **Associate** | `role = 'employee'` | Own attendance, leave, claims, documents |
| **Intern** | `employment_type = 'intern'` | An associate with one leave day per month; internship runs 3 months |

**Intern appears in the Portal role dropdown**, but it is not a database role —
choosing it sets `employment_type = 'intern'` and leaves `role = 'employee'`,
because an intern's permissions are an associate's. The two fields are kept in
step by the form: picking Intern in either place updates the other, and moving
someone off Intern returns them to full time. That way one dropdown answers
"what is this person" without the two columns ever contradicting each other.

**Only a super admin can change a role.** `employees_guard_update()` resets the
`role` column on any update made by HR, so the tier above them is the only way
in — which is the point of having one.

**Company activity** (super admin only) is every pending decision in one place:
leave, claims and regularizations across all departments, headcount, who is in
today, what is approved but unpaid, and which departments have no manager.

## Roles and approvals

Three roles, set on the employee record: `employee`, `manager`, `hr_admin`.

A **manager** approves for their own **department** — the match is on the
`department` column, so a manager of Social Media sees Social Media's leave and
regularization requests and nobody else's. This is enforced by
`manages_employee()` in the policies, not by the interface. HR sees everything.

Every decision records who made it. Approved and rejected requests show
"by <name> (manager)" or "by <name> (HR)" to the employee and in the approval
queue, so there is never a question of who waved something through.

To appoint one: Employees → edit the person → **Portal role → Manager**. Make
sure their `department` matches the team they run.

## Regularization

An employee who was marked late, or whose day never got marked, can raise a
regularization request from **Attendance → My month → Regularize**, giving a
reason. Their manager or HR approves it under **Attendance → Requests**.

Approving a late request sets `late_waived` on that attendance row, which
drops the day out of their late count — the trigger that marks arrivals late
respects the waiver, so it does not come back on the next write. Reversing an
approval puts the late back.

Approving a missed-day request records the day as present, with the reason
stored in the note.

## Monthly attendance report

**Attendance → Team roster → Month report** downloads either of two CSVs:

- **Summary** — one row per person: present, WFH, half days, leave, absent,
  late arrivals, days marked, hours logged. This is the payroll one.
- **Daily detail** — one row per person per day, with times, hours and the
  late flag, for auditing a particular week.

Both open directly in Excel.

## Office network restriction

Checking in and out requires being on an approved network. Everything else —
leave, claims, documents, the directory — works from anywhere, so someone off
sick can still apply for leave.

Manage the list under **Activity → Office network** (super admin). It shows the
IP you are calling from, so adding the office is one click. A single static IP
ends in `/32`; a range uses a smaller prefix such as `203.0.113.0/24`.

- **Fails open.** With no active network on the list, nothing is restricted —
  installing the migration cannot lock anyone out before you configure it.
- **HR and managers are exempt.** They correct the roster for past days, often
  from elsewhere, and restricting that helps nobody.
- Postgres reads the caller's address from the request headers and compares it
  against `allowed_networks`, so the rule holds even if someone calls the API
  directly. It reads the **last** `X-Forwarded-For` entry — the one Supabase's
  edge appends — so a client that injects its own value does not win.

It is a solid deterrent for ordinary staff, not a defence against someone
actively attacking it. Anyone determined can reach the office network over a
VPN, and header-based IP detection has limits.

## Work rules

Two numbers are enforced in the database, not just the interface, so they hold
even if someone pokes at the API directly:

- **Late after 10:20 IST.** A check-in past that is flagged `is_late` by a
  trigger. The chip beside the bell counts your late arrivals this month.
- **Eight hours before check-out.** A trigger rejects an early check-out; the
  button is replaced by a countdown until the eight hours are up. HR is exempt,
  so a genuine short day can still be corrected from the roster.

Both live in `src/lib/policy.js` (for the interface) and
`supabase/add_work_rules.sql` (for the database). **Change them in both places**
or they will disagree — the database wins, and the interface will look broken.

Half-day leave was removed — leave is counted in whole working days, and
weekends and company holidays are skipped automatically.

**Entitlements**, granted on hire and re-granted when employment type changes:

| Leave type | Intern | Everyone else |
|---|---|---|
| Casual | 12 — but **one per month** | 10 |
| Sick | — | 12 |
| Maternity | — | 182 (6 months) |
| Paternity | — | 15 |
| Family marriage | — | 3 |
| Own marriage | — | 10 |

An intern's 12 casual days cannot be taken in a lump: `enforce_intern_leave_cap()`
rejects a second day in the same calendar month, and a request that straddles two
months. Maternity and paternity sit on every record and go unused where they don't
apply — simpler than asking HR to grant them case by case. To change the
numbers, edit `grant_leave_balances()` in `supabase/schema.sql` and re-run it.

When an intern's employment type is changed to full time, a trigger re-grants
their balances on the new basis automatically.

## Holiday calendar

**Holidays** in the sidebar, visible to everyone, editable by HR only. Entries
can span days (Diwali, Dussehra, the summer and winter breaks). Leave requests
skip these dates, so a week off over Diwali does not eat someone's casual leave.

The 2026 calendar is seeded by `supabase/add_holidays_and_leave_policy.sql`.

## Alerts

The bell refreshes every five minutes and whenever it is opened.

HR sees: pending leave, pending reimbursements, birthdays within 7 days,
interns converting within 21 days, and notice periods ending within 15 days.
Employees see their own request outcomes and anything missing from their profile.

Two dates drive the last two:

- **Internship converts on** — set per intern, or left empty to mean three months
  from the joining date.
- **Last working day** — set when someone's status becomes On notice.

Both appear in the employee form only when they apply, and in the detail panel
beside the joining date.

## Project layout

```
HRM_Portal/
├─ supabase/
│  ├─ schema.sql             tables, RLS policies, triggers, views  ← run this first
│  ├─ make_admin.sql         promote the first HR admin
│  └─ seed_sample_data.sql   optional demo employees
├─ src/
│  ├─ lib/
│  │  ├─ supabaseClient.js   the Supabase client
│  │  ├─ auth.jsx            session + employee record context
│  │  └─ format.js           dates, labels, working-day maths
│  ├─ components/            Layout, Modal, Badge, Spinner, ProtectedRoute
│  ├─ pages/                 Login, Dashboard, Employees, Attendance, Leave, Profile
│  ├─ App.jsx                routes
│  └─ index.css              all styling (light + dark, responsive)
├─ .env.example
└─ package.json
```

## Leave rules baked in

- Types: casual, sick, earned, unpaid.
- New employees are auto-granted 12 casual / 6 sick / 15 earned days for the
  current year (change the numbers in `seed_default_balances()` in `schema.sql`).
- Day count excludes Saturdays and Sundays; half-day requests count as 0.5.
- Balances shown are `entitled − approved days this year`, from the
  `leave_balance_summary` view.

## Deploying to Vercel

1. Push the repo to GitHub. Make it **private** — `.env` is gitignored so no keys
   leak, but the schema and HR logic are nobody else's business.
2. Vercel → **Add New → Project** → import the repo. It detects Vite; leave the
   build command (`npm run build`) and output directory (`dist`) as found.
3. Add two environment variables, for all three environments:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the same values as `.env`.
   **Never add the service_role key** — anything in a `VITE_` variable ships to
   the browser.
4. Deploy, then take the resulting URL to **Supabase → Authentication → URL
   Configuration** and set **Site URL** to it, adding it to **Redirect URLs** too.
   Password resets and email confirmations point at that URL.

`vercel.json` handles the part people usually trip on: a single-page app needs
every path rewritten to `index.html`, or refreshing on `/employees` returns a 404.

Pushing to the default branch redeploys. Pull requests get their own preview URL —
those hit the same live Supabase project, so treat preview data as real.

## Ideas for the next pass

- Payroll / payslips (the `employees` table is ready for salary fields)
- Document uploads via Supabase Storage (offer letters, ID proofs)
- Recruitment pipeline
- Email notifications on leave approval (Supabase Edge Function + Resend)
- Monthly attendance export to CSV/Excel

# HR Administrator — User Guide

## 1. Sign in
Open the app and sign in with your HR account (demo: `admin` / `admin123` in local mode).

## 2. Import the staff list (monthly)
1. Go to **Import**.
2. Click **Choose File** and select the current `NTB_Staff list_*.xlsx`.
3. Wait a few seconds — the app opens the workbook, auto-detects the employee
   sheet (by its *Employee ID* + *Staff/ANPE/PSIE* headers) and skips hidden/helper sheets.
4. Read the **preview**: rows read, new, updated, eligible Agents, newly eligible,
   lost eligibility, duplicates, invalid rows, and people missing from the file.
5. Click **✔ Confirm import** to apply. Nothing is written until you confirm.

Notes:
- Employees who move to category **Agent** become eligible automatically.
- People absent from the new file are flagged **"missing from latest import"** — they
  are *not* deleted. Decide later whether to keep, exit, or archive them.
- Rows without an Employee ID are reported as invalid and skipped.

## 3. Employees & access
- **Employees** page: search, filter by category, open a record.
- On a record you can set **Access override**:
  - `AUTO` — eligibility follows the Agent rule (default),
  - `ALLOWED` — force-eligible (e.g. special case), unless the person has left,
  - `BLOCKED` — force-ineligible (badge will be refused).
- Every change is written to the **Audit log**.

## 4. Badges
- **Badges** page shows eligible employees and whether they have an active badge.
- **Generate missing** creates QR tokens for everyone still without one.
- **Print** (one or all) opens the print dialog with badge cards. Print on card stock.
- If a badge is lost: open the employee → **Revoke badge** (old QR stops working
  immediately) → **Generate badge** for a new one.

## 5. Meal services & price
- **Settings → Meal services**: only *Lunch* is active at launch; you can enable others.
- **Settings → Meal price**: add a new price with an *effective from* date. Old prices
  are kept so historical reports never change. The price applied at each scan is stored
  on the meal record.
- **Settings → Providers**: record the catering provider(s).

## 6. Correcting a meal
Meals are never deleted. To correct one served by mistake, cancel it (a reason is
mandatory) — it stops being billable and appears in the Exceptions report and audit log.

## 7. Reports
**Reports** page → pick a date range → export:
- **Daily report** — every meal with employee, time, method, price, status.
- **Provider summary** — meals per day/service with gross and net billable amounts.
- **Eligible list** — who is allowed and their badge status.
- **Exceptions** — cancellations, manual entries, denied-access attempts.

## 8. Users & audit
- **Users** (local mode): add scanner/finance/HR accounts, reset passwords.
  (In cloud mode, manage users in the Supabase dashboard.)
- **Audit log**: full trail of imports, access changes, badge actions, price changes,
  cancellations, and exports.

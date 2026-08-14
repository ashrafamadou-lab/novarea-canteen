# Technical Decisions, Data Model, API & Limitations

## 1. Why a single-file PWA + optional Supabase (not Next.js + Postgres + Docker)

The original brief was written for a Next.js/PostgreSQL/Prisma/Docker stack. The target
development machine has **no Node.js, no Docker, and no Python**, so that stack could not
be built, migrated, or *tested* there — and the brief itself requires never claiming a
test passed unless it actually ran. The same operational goals are met by the approach
already proven and deployed for this factory (the Petite Caisse app):

- **Local-first single-page PWA** — installs on Android tablets, works offline, one file to host.
- **Optional Supabase (PostgreSQL)** — real accounts, roles via Row Level Security, and a
  **database-level unique constraint** that provides the exact server-enforced
  duplicate-blocking guarantee the brief asks for, across all devices.

This was chosen with the user's explicit agreement.

## 2. Core logic is isolated and unit-tested

All money- and access-sensitive rules live in `assets/core.js` as pure functions and are
covered by 38 assertions in `assets/tests.js` (runnable on the in-app **Tests** page):
eligibility matrix, one-meal-per-day rule (including cancellation freeing the slot),
billing (excludes cancelled, keeps historical price), Excel header mapping/sheet
detection, Excel date-serial conversion, and QR token shape.

## 3. The one-meal guarantee

- **Rule:** unique on `(employee_id, meal_date, meal_service_id)` for non-cancelled meals.
- **Cloud:** enforced by a **partial unique index** (`where status='VALID'`) — the database
  rejects a duplicate even under a race between two tablets. A CANCELLED record frees the
  slot so a corrected re-scan is possible.
- **Local:** enforced in-app; safe for a single terminal.

## 4. Price is captured at scan time
Each meal stores `unit_price_at_scan`. Changing the price later never alters past reports.

## 5. Privacy
The staff workbook contains bank account, CNSS, IFU, salary-adjacent and contact columns.
**None of these are imported.** Only identity/eligibility fields are read
(ID, name, category, department, position, gender, dates, contract type). The QR badge
carries an **opaque random token**, never the raw Employee ID or any personal data. The
service worker never caches Supabase API responses.

---

## 6. Data model

Local collections (`localStorage`) mirror the cloud tables one-to-one.

| Entity | Key fields |
|---|---|
| **Employee** | `employeeId` (business key), `fullName`, `department`, `position`, `gender`, `sourceCategory` (Agent/ANPE/Staff/PSIE), `employmentStatus`, `joiningDate`, `contractType`, `contractStart/End`, `accessOverride` (AUTO/ALLOWED/BLOCKED), `isEligible`, `eligibilityReason`, `missingFromLatestImport`, timestamps |
| **Badge** | `employeeId`, `token` (opaque), `displayTokenReference`, `status` (ACTIVE/REVOKED), `issuedAt`, `revokedAt` |
| **MealRecord** | `employeeId`, `mealDate`, `mealServiceId`, `scannedAt`, `scannerUserId`, `scannerSessionId`, `scanMethod` (QR/MANUAL_ID), `eligibilityStatusAtScan`, `sourceCategoryAtScan`, `unitPrice`, `status` (VALID/CANCELLED), `cancelReason/By/At`, `syncStatus` |
| **MealService** | `id` (lunch…), `label`, `isActive` |
| **MealPrice** | `amount`, `currency` (XOF), `effectiveFrom`, `effectiveTo`, `providerId` |
| **Provider** | `name`, `contact`, `status` |
| **User / profile** | local: `username`, `name`, `role`, `passHash`; cloud: Supabase Auth + `profiles.role` |
| **EmployeeImport** | `fileName`, `stats`, `createdAt` |
| **AuditLog** | `userId/Email`, `action`, `entity`, `entityId`, `oldValue`, `newValue`, `sessionId`, `createdAt` |
| **AppSetting** | key/value |

**Billing strategy (documented):** a meal is billable when `status = 'VALID'`.
`billableSum` = Σ `unitPrice` over VALID records in range. Cancellations are excluded but
retained for audit.

---

## 7. "API" (cloud mode)

There is no custom server; the API surface is Supabase's auto-generated REST/Realtime over
these tables, gated by Row Level Security. Effective contract:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `employees` | any authenticated | HR_ADMIN | HR_ADMIN | HR_ADMIN |
| `badges` | any authenticated | HR_ADMIN | HR_ADMIN | HR_ADMIN |
| `meal_records` | any authenticated | HR_ADMIN, SCANNER | HR_ADMIN (cancel) | — (never) |
| `meal_services` / `meal_prices` / `providers` | any authenticated | HR_ADMIN | HR_ADMIN | HR_ADMIN |
| `audit_log` | HR_ADMIN | any authenticated | — | — |
| `profiles` | self + HR_ADMIN | (trigger on signup) | HR_ADMIN | — |

Realtime: the app subscribes to `meal_records` and `employees` changes to keep dashboards
live across terminals. Duplicate inserts are rejected by `uniq_meal_per_service` and the
app renders them as *"MEAL ALREADY RECORDED"*.

---

## 8. Honest limitations (before production)

1. **Excel parsing is slow in the browser** (~20 s for this 16-sheet workbook) because
   ExcelJS loads every sheet. Acceptable for a monthly HR import, but not instant. Could be
   sped up by pre-trimming the workbook or moving parsing to a Supabase Edge Function.
2. **Local mode stores data unencrypted** in `localStorage`. The brief asked for an
   encrypted offline cache; this is **not** implemented. For sensitive multi-day use,
   prefer cloud mode, and always device-lock the tablet. (No bank/salary data is stored
   regardless.)
3. **Offline meal queue is basic.** Meals scanned offline are marked `PENDING` and pushed
   on reconnect, but there is no dedicated admin *conflict-resolution page*; conflicts
   across multiple offline devices are prevented by the recommendation to run **one**
   offline terminal. Multi-device offline needs the conflict UI built out.
4. **Camera scanning needs a secure context** (HTTPS or localhost) and a working rear
   camera; the Manual ID fallback covers failures. Camera could not be exercised in the
   headless test browser — the scan *logic* is verified, camera capture should be smoke-
   tested on the real tablet.
5. **Cloud mode was verified for code shape, not live**, because it needs your Supabase
   project. The schema, mappers, and RLS are written and self-consistent; run the schema and
   do one live end-to-end pass before go-live.
6. **No automated E2E/browser test runner in CI** — tests run in-app (38/38 pass) and were
   executed manually via the preview browser; wiring Playwright would require Node.

---

## 9. Bilingual FR/EN
The UI is fully **bilingual French/English**, French by default (the users are francophone),
with a FR/EN toggle on the login screen and in the sidebar. Screens render in English and a
`translateDOM()` pass maps the rendered text to French from an `I18N` dictionary keyed by the
English source string (caching each node's original so it toggles both ways); a few regex
patterns cover interpolated strings (dates, counts). The choice persists in `localStorage`
(`ntbc_lang`). Employee names, departments and category codes stay as entered. Excel export
headers remain English (data files) — localize later if HR prefers.

## 10. Recommended next steps
- Run the Supabase schema and do one live multi-tablet test (confirm the unique index
  blocks a real cross-device double scan).
- Provide the official Novarea logo (drop-in replace `assets/logo-novarea.png`).
- Build the offline conflict-resolution page if more than one offline terminal is ever needed.
- Add the encrypted local cache if local mode will hold data for long periods.

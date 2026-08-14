# Novarea — Canteen Access & Meal Control (PWA)

A Progressive Web App for **Novarea Textiles Benin** to control canteen access and
record meals actually served, so the catering provider can be billed accurately.
Scan an employee's QR badge → the system checks eligibility, blocks duplicates,
records the meal, and feeds a real-time dashboard and Excel reports.

Built as a **single-page PWA** (same proven approach as the Petite Caisse app):
runs locally with no backend, and can optionally connect to **Supabase** for
multi-device, real-time, server-enforced duplicate blocking.

---

## What was verified (real, not claimed)

| Check | Result |
|---|---|
| Unit test suite (eligibility, one-meal rule, billing, import mapping, dates, QR) | **38 / 38 pass** — run it yourself on the **Tests** page |
| Import of the real `NTB_Staff list_With_Dashboard_August 2026.xlsx` | Auto-detected sheet **"Staff list - Juillet 2026"**, found **65 Agents** (matches HR expectation) |
| Live scan | First scan → *MEAL AUTHORIZED*; second same-day scan → *MEAL ALREADY RECORDED* (no duplicate) |
| Dashboard aggregation | Utilization & billable totals match the underlying records |

The Agent count is **derived from the file at import time**, never hard-coded.

---

## Quick start (local, Windows — no Node/Docker needed)

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 5600
```

Then open <http://localhost:5600/> and sign in with a demo account below.
(Any static file server works; `serve.ps1` is included because this machine has no Node.)

### Demo accounts (LOCAL mode only — change before production)

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | HR Administrator |
| `scanner` | `scan123` | Canteen Scanner |
| `finance` | `fin123` | Finance Viewer |

> These are seeded only when running in local mode with an empty database.
> **Never ship these to production.** In cloud mode, accounts live in Supabase.

---

## The two modes

### Local mode (default)
`assets/supabase-config.js` is empty → all data lives in this browser
(`localStorage`). Perfect for a **single scanning terminal**. Fully offline once
installed. Duplicate blocking is enforced in-app on that one device.

### Cloud mode (multi-device)
Fill `assets/supabase-config.js` with your Supabase URL + anon key, and run
`supabase-schema.sql` once. Then:
- real accounts & roles (Supabase Auth + Row Level Security),
- **database-level unique constraint** blocks duplicate meals across *all* devices
  in real time,
- realtime dashboard across terminals.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full cloud setup.

---

## Roles

- **HR Administrator** — import Excel, manage employees & access, generate/print
  badges, configure services & prices, cancel meals (with mandatory reason),
  view everything, export reports, audit log.
- **Canteen Scanner** — scan screen + manual ID entry + session counter only.
  Cannot see salaries, bank details, or export the employee base.
- **Finance / Management Viewer** — dashboard, billable meals, reports, history.
  Strictly read-only.
- **Food Provider Viewer** — defined in the schema for later; not enabled at launch.

Permissions are enforced in the UI **and** on the server (Supabase RLS in cloud mode).

---

## Eligibility rule

```
BLOCKED            -> Not eligible
else Exited/left   -> Not eligible
else ALLOWED       -> Eligible (manual override)
else (AUTO)        -> Eligible only if category = "Agent" AND active
```

Reason codes: `ELIGIBLE_AGENT`, `ALLOWED_OVERRIDE`, `NOT_AGENT`, `EMPLOYEE_INACTIVE`,
`EMPLOYEE_EXITED`, `ACCESS_BLOCKED`, `INVALID_EMPLOYEE_RECORD`. When someone moves to
category **Agent** on the next import, eligibility turns on automatically.

---

## Project structure

```
canteen_pwa/
├── index.html              # the whole app (UI + storage + QR + import/export)
├── assets/
│   ├── core.js             # PURE logic (eligibility, dedup, billing, Excel mapping) — unit-tested
│   ├── tests.js            # the 38 browser-run unit tests
│   ├── supabase-config.js  # empty = local; fill = cloud
│   ├── logo-novarea.png    # configurable branding
│   └── emblem.png
├── service-worker.js       # offline cache; never caches Supabase data
├── manifest.json           # installable PWA
├── netlify.toml            # static hosting headers
├── supabase-schema.sql     # cloud tables, unique meal constraint, RLS, roles
├── serve.ps1               # local static server (no Node needed)
└── docs/
    ├── GUIDE_HR.md         # HR administrator guide
    ├── GUIDE_SCANNER.md    # canteen agent guide
    ├── DEPLOYMENT.md       # Netlify + Supabase deployment
    ├── BACKUP_RESTORE.md   # backup & restore
    └── TECH_DECISIONS.md   # decisions, data model, API, limitations
```

---

## Reports (Excel)

From the **Reports** page (HR / Finance): Daily report, Provider summary (billable),
Eligible employees list, and Exceptions (cancellations, manual entries, denied access).
Each export is a clean `.xlsx` with a styled header, ready for HR/Finance.

## Badges

From **Badges** (HR): generate opaque QR tokens (`NTB-CAN-XXXX-XXXX-XXXX` — never the
raw Employee ID), print badge cards (logo, name, ID, department, QR, "Canteen Access"),
revoke a lost badge (old QR is refused immediately) and reissue.

---

## Security highlights

- Passwords hashed (SHA-256 + salt) in local mode; Supabase Auth in cloud mode.
- The QR carries an **opaque token**, not personal data.
- Sensitive columns from the staff file (**bank account, CNSS, IFU, salary, phone**)
  are **never imported or shown** to scanners.
- Meals are never physically deleted — corrections are logical cancellations with a
  mandatory reason, recorded in the audit log.
- Service worker never caches Supabase API responses.

See [docs/TECH_DECISIONS.md](docs/TECH_DECISIONS.md) for the honest list of current limitations.

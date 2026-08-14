# Deployment Guide

Two ways to run: **Local** (one device, no accounts) or **Cloud** (multi-device, real
accounts, server-enforced duplicate blocking). Same code — cloud is unlocked by filling
`assets/supabase-config.js`.

---

## A. Local single-terminal

1. Copy the `canteen_pwa` folder to the scanning device (or serve it from any static host).
2. Serve it (Windows, no Node required):
   ```bash
   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 5600
   ```
3. Open `http://localhost:5600/`, sign in, and on the tablet use the browser's
   **Install app** / **Add to Home screen**. It then runs full-screen and offline.
4. Change the demo passwords in **Users**.

> Camera + install require a **secure context**: `localhost` is fine; a LAN IP is not.
> For a tablet pointing at another machine, host over HTTPS (see Cloud, or put it behind
> any HTTPS reverse proxy).

---

## B. Cloud (recommended for several terminals)

### 1. Create the Supabase project
1. Go to <https://supabase.com>, create a project (pick the region closest to Benin).
2. Open **SQL Editor → New query**, paste all of `supabase-schema.sql`, run it.
   This creates the tables, the **partial unique index** that blocks duplicate meals
   (`uniq_meal_per_service`), Row Level Security, and the roles.

### 2. Create accounts & roles
1. **Authentication → Users → Add user** for each staff member (email + password).
2. In **SQL Editor**, set roles:
   ```sql
   update profiles set role='HR_ADMIN'        where email='hr@novarea.com';
   update profiles set role='SCANNER'         where email='canteen@novarea.com';
   update profiles set role='FINANCE_VIEWER'  where email='finance@novarea.com';
   ```

### 3. Point the app at the project
Edit `assets/supabase-config.js`:
```js
window.SUPABASE_URL      = "https://YOURPROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "your-anon-public-key";
```
The anon key is public and safe to ship; RLS is what protects the data.

### 4. Host the static files (Netlify)
- Drag the `canteen_pwa` folder onto <https://app.netlify.com/drop>, **or** connect a Git repo.
- `netlify.toml` is included: it sets `no-cache` on the service worker / entry files and
  security headers. Netlify serves over HTTPS, so camera + install work on any device.

> **PowerShell zip gotcha:** if you build a zip with `Compress-Archive`, entry paths use
> `\` and break subfolders on Netlify. Build the zip with `System.IO.Compression.ZipArchive`
> and replace `\` with `/` in entry names (same fix used for the Petite Caisse app).

### 5. First run
Sign in with an account you created. HR imports the staff Excel; badges are generated;
scanners sign in on their tablets. Duplicate meals are now blocked at the database for
**all** devices simultaneously.

---

## Updating the app
Edit files and redeploy. The service worker caches aggressively — after deploying, bump
`CACHE_NAME` in `service-worker.js` (e.g. `ntb-canteen-v2`) so devices pick up the change,
or have users pull-to-refresh once.

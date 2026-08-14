# Backup & Restore

## Local mode (data in the browser)

All data lives in the scanning device's browser `localStorage` under keys
`ntbc_employees`, `ntbc_badges`, `ntbc_meals`, `ntbc_services`, `ntbc_prices`,
`ntbc_providers`, `ntbc_users`, `ntbc_audit`, `ntbc_imports`, `ntbc_settings`.

### Back up
The safest routine backup is the **Excel exports** on the Reports page — export the
Daily report and Provider summary at the end of each day/period and keep them.

For a full raw snapshot, run this in the browser console (F12) while signed in:
```js
const dump={}; ['employees','badges','meals','services','prices','providers','users','audit','imports','settings']
  .forEach(k=>dump[k]=JSON.parse(localStorage.getItem('ntbc_'+k)||'null'));
const a=document.createElement('a');
a.href=URL.createObjectURL(new Blob([JSON.stringify(dump)],{type:'application/json'}));
a.download='ntb-canteen-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
```

### Restore
```js
const dump=/* paste the JSON object here */;
Object.keys(dump).forEach(k=>localStorage.setItem('ntbc_'+k,JSON.stringify(dump[k])));
location.reload();
```

> Because local data is tied to one browser profile, treat the scanning device as the
> system of record and export to Excel daily. Do not clear the browser data without a backup.

---

## Cloud mode (Supabase)

Supabase keeps automatic backups on paid plans. In addition:

### Manual backup
- **Dashboard → Database → Backups** to download a snapshot, or
- Use `pg_dump` with your connection string:
  ```bash
  pg_dump "postgresql://postgres:PASSWORD@db.YOURPROJECT.supabase.co:5432/postgres" \
    --schema=public --no-owner -f ntb-canteen-$(date +%F).sql
  ```

### Restore
```bash
psql "postgresql://postgres:PASSWORD@db.YOURPROJECT.supabase.co:5432/postgres" \
  -f ntb-canteen-YYYY-MM-DD.sql
```

### What to keep
- Daily Excel exports (human-readable, provider-facing).
- Weekly database snapshot.
- The `supabase-schema.sql` in version control so the structure can be rebuilt anytime.

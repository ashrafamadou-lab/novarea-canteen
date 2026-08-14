-- =====================================================================
-- Novarea Canteen — Supabase schema (CLOUD mode)
-- Run this in: Supabase -> your project -> SQL Editor -> New query.
-- Creates tables, the database-level one-meal-per-day constraint,
-- roles, and Row Level Security. Safe to re-run (IF NOT EXISTS).
-- =====================================================================

-- ---- Roles / profiles ------------------------------------------------
-- App roles: HR_ADMIN, SCANNER, FINANCE_VIEWER, PROVIDER_VIEWER
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'SCANNER'
              check (role in ('HR_ADMIN','SCANNER','FINANCE_VIEWER','PROVIDER_VIEWER')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- SECURITY DEFINER so these read `profiles` WITHOUT triggering its RLS
-- (otherwise policies that call these on `profiles` recurse infinitely).
create or replace function is_hr_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'HR_ADMIN' and p.is_active);
$$;
create or replace function my_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- ---- Employees -------------------------------------------------------
create table if not exists employees (
  id                       bigserial primary key,
  employee_id              text unique not null,
  full_name                text not null,
  department               text,
  position                 text,
  gender                   text,
  source_category          text,               -- Agent / ANPE / Staff / PSIE
  employment_status        text not null default 'Active',
  joining_date             date,
  contract_type            text,
  contract_start           date,
  contract_end             date,
  access_override          text not null default 'AUTO' check (access_override in ('AUTO','ALLOWED','BLOCKED')),
  is_eligible              boolean not null default false,
  eligibility_reason       text,
  missing_from_latest_import boolean not null default false,
  last_import_id           bigint,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  archived_at              timestamptz
);
create index if not exists idx_emp_category on employees(source_category);

-- ---- Badges ----------------------------------------------------------
create table if not exists badges (
  id                     bigserial primary key,
  employee_id            text not null references employees(employee_id) on delete cascade,
  token                  text unique not null,      -- opaque QR token (NTB-CAN-....)
  display_token_reference text,
  status                 text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  issued_at              timestamptz not null default now(),
  revoked_at             timestamptz,
  revoked_by             uuid,
  replacement_badge_id   bigint
);
create index if not exists idx_badge_emp on badges(employee_id);

-- ---- Meal services & versioned prices --------------------------------
create table if not exists meal_services (
  id         text primary key,           -- lunch, breakfast, dinner, other
  label      text not null,
  is_active  boolean not null default false
);
insert into meal_services(id,label,is_active) values
  ('lunch','Lunch',true)
on conflict (id) do nothing;

create table if not exists meal_prices (
  id            bigserial primary key,
  amount        numeric(12,2) not null,
  currency      text not null default 'XOF',
  effective_from date not null,
  effective_to   date,
  provider_id    bigint,
  changed_by     uuid,
  created_at     timestamptz not null default now()
);

create table if not exists providers (
  id          bigserial primary key,
  name        text not null,
  contact     text,
  status      text not null default 'ACTIVE',
  created_at  timestamptz not null default now()
);

-- ---- Meal records ----------------------------------------------------
create table if not exists meal_records (
  id                      bigserial primary key,
  employee_id             text not null,
  meal_date               date not null,
  meal_service_id         text not null references meal_services(id),
  scanned_at              timestamptz not null default now(),
  scanner_user_id         uuid,
  scanner_session_id      text,
  scan_method             text not null default 'QR' check (scan_method in ('QR','MANUAL_ID')),
  eligibility_status_at_scan text,
  source_category_at_scan text,
  unit_price_at_scan      numeric(12,2),
  currency                text default 'XOF',
  status                  text not null default 'VALID' check (status in ('VALID','CANCELLED')),
  cancel_reason           text,
  cancelled_by            uuid,
  cancelled_at            timestamptz,
  sync_status             text not null default 'SYNCED',
  created_at              timestamptz not null default now()
);

-- *** The critical guarantee: one non-cancelled meal per employee+date+service ***
-- A partial unique index so a CANCELLED record frees the slot for a re-scan.
create unique index if not exists uniq_meal_per_service
  on meal_records (employee_id, meal_date, meal_service_id)
  where (status = 'VALID');
create index if not exists idx_meal_date on meal_records(meal_date);

-- ---- Import batches --------------------------------------------------
create table if not exists employee_imports (
  id          bigserial primary key,
  file_name   text,
  imported_by uuid,
  stats       jsonb,
  created_at  timestamptz not null default now()
);

-- ---- Audit log -------------------------------------------------------
create table if not exists audit_log (
  id          bigserial primary key,
  user_id     uuid,
  user_email  text,
  action      text not null,
  entity      text,
  entity_id   text,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  text,
  session_id  text,
  created_at  timestamptz not null default now()
);

create table if not exists app_settings (
  key   text primary key,
  value jsonb
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table profiles       enable row level security;
alter table employees      enable row level security;
alter table badges         enable row level security;
alter table meal_services  enable row level security;
alter table meal_prices    enable row level security;
alter table providers      enable row level security;
alter table meal_records   enable row level security;
alter table employee_imports enable row level security;
alter table audit_log      enable row level security;
alter table app_settings   enable row level security;

-- Policies are dropped-then-created so this whole script is safe to re-run
-- (Postgres has no CREATE POLICY IF NOT EXISTS).

-- profiles: a user reads their own; HR admins read all.
drop policy if exists p_profiles_self on profiles;
create policy p_profiles_self on profiles for select using (id = auth.uid() or is_hr_admin());
drop policy if exists p_profiles_admin on profiles;
create policy p_profiles_admin on profiles for all using (is_hr_admin()) with check (is_hr_admin());

-- employees: any authenticated user can READ (needed for scan validation),
-- but only HR admins can write. (Sensitive columns like bank/CNSS are NOT
-- stored in this table at all — they never leave the source Excel.)
drop policy if exists p_emp_read on employees;
create policy p_emp_read on employees for select using (auth.role() = 'authenticated');
drop policy if exists p_emp_write on employees;
create policy p_emp_write on employees for all using (is_hr_admin()) with check (is_hr_admin());

drop policy if exists p_badge_read on badges;
create policy p_badge_read on badges for select using (auth.role() = 'authenticated');
drop policy if exists p_badge_write on badges;
create policy p_badge_write on badges for all using (is_hr_admin()) with check (is_hr_admin());

drop policy if exists p_service_read on meal_services;
create policy p_service_read on meal_services for select using (auth.role() = 'authenticated');
drop policy if exists p_service_write on meal_services;
create policy p_service_write on meal_services for all using (is_hr_admin()) with check (is_hr_admin());

drop policy if exists p_price_read on meal_prices;
create policy p_price_read on meal_prices for select using (auth.role() = 'authenticated');
drop policy if exists p_price_write on meal_prices;
create policy p_price_write on meal_prices for all using (is_hr_admin()) with check (is_hr_admin());

drop policy if exists p_provider_read on providers;
create policy p_provider_read on providers for select using (auth.role() = 'authenticated');
drop policy if exists p_provider_write on providers;
create policy p_provider_write on providers for all using (is_hr_admin()) with check (is_hr_admin());

-- meal_records: SCANNER and HR_ADMIN can INSERT; HR_ADMIN can UPDATE (cancel);
-- everyone authenticated can READ (dashboard/reports). No physical DELETE.
drop policy if exists p_meal_read on meal_records;
create policy p_meal_read on meal_records for select using (auth.role() = 'authenticated');
drop policy if exists p_meal_insert on meal_records;
create policy p_meal_insert on meal_records for insert
  with check (my_role() in ('HR_ADMIN','SCANNER'));
drop policy if exists p_meal_update on meal_records;
create policy p_meal_update on meal_records for update using (is_hr_admin()) with check (is_hr_admin());

drop policy if exists p_import_read on employee_imports;
create policy p_import_read on employee_imports for select using (auth.role() = 'authenticated');
drop policy if exists p_import_write on employee_imports;
create policy p_import_write on employee_imports for all using (is_hr_admin()) with check (is_hr_admin());

-- audit: readable by HR admins; insertable by any authenticated user; never updatable/deletable.
drop policy if exists p_audit_read on audit_log;
create policy p_audit_read on audit_log for select using (is_hr_admin());
drop policy if exists p_audit_insert on audit_log;
create policy p_audit_insert on audit_log for insert with check (auth.role() = 'authenticated');

drop policy if exists p_settings_read on app_settings;
create policy p_settings_read on app_settings for select using (auth.role() = 'authenticated');
drop policy if exists p_settings_write on app_settings;
create policy p_settings_write on app_settings for all using (is_hr_admin()) with check (is_hr_admin());

-- =====================================================================
-- Realtime + auto-profile on signup
-- =====================================================================
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- After creating your first user in the dashboard, promote them:
--   update profiles set role = 'HR_ADMIN' where email = 'you@example.com';

do $$ begin
  alter publication supabase_realtime add table meal_records;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table employees;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- Admin action: wipe all operational cloud data (used by the app's
-- "Delete cloud data" button). HR_ADMIN only. Keeps meal_services,
-- profiles/auth and audit_log.
-- =====================================================================
create or replace function reset_canteen_data() returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_hr_admin() then raise exception 'Not authorized'; end if;
  delete from meal_records where true;
  delete from badges where true;
  delete from employee_imports where true;
  delete from meal_prices where true;
  delete from providers where true;
  delete from employees where true;
end; $$;
grant execute on function reset_canteen_data() to authenticated;

-- Run in Supabase SQL editor after migration-outbound-backfill.sql
-- Adds a centralized, append-only audit log (User Activity Log) recording
-- create/update/delete/login/logout/etc. actions across every module.
--
-- Schema is intentionally generic (module/action/record_type/record_id +
-- free-form old_data/new_data jsonb) so future modules (Returns, Stock
-- Adjustments, ...) can log through the same table without a migration.
--
-- Note: there is no in-app user-management UI (users/roles are created
-- directly in the Supabase dashboard per CLAUDE.md), so User Created/
-- Updated/Deleted/Role Changed actions are not logged — nothing calls them.
-- Failed-login logging is also out of scope: with no backend, a failed
-- login has no session, so RLS (which requires auth.uid() = user_id) can
-- never allow that insert from the client.

create table if not exists audit_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  user_name   text,
  user_role   text,
  module      text not null,
  action      text not null,
  record_type text,
  record_id   text,
  description text,
  old_data    jsonb,
  new_data    jsonb,
  success     boolean not null default true
);

create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);
create index if not exists audit_logs_module_idx      on audit_logs (module);
create index if not exists audit_logs_user_id_idx     on audit_logs (user_id);
create index if not exists audit_logs_record_idx      on audit_logs (record_type, record_id);

alter table audit_logs enable row level security;

-- Any authenticated user can insert a log row for themselves (admins log
-- too — they perform inserts on invoices/customer orders/supplier
-- orders/GRNs/customers/suppliers, and those need to be logged).
drop policy if exists "insert own logs" on audit_logs;
create policy "insert own logs" on audit_logs
  for insert with check (user_id = auth.uid());

-- Only power users can read the log (admins cannot view Reports).
drop policy if exists "power read" on audit_logs;
create policy "power read" on audit_logs
  for select using (is_power_user());

-- Deliberately no update/delete policy — logs are immutable and permanent
-- for everyone, including power users.

-- Power users can read all user_roles rows (previously only "own row" was
-- readable) so the log viewer's "User" filter dropdown can list real names.
drop policy if exists "power read all" on user_roles;
create policy "power read all" on user_roles
  for select using (is_power_user());

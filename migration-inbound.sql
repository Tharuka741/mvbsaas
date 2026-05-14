-- Run in Supabase SQL editor after migration-auth-update.sql
-- Adds a status column to grns to support the two-step inbound confirmation workflow.
-- Step 1 (GRN page):   generate GRN → saved with status = 'pending'
-- Step 2 (Inbound page): manager/ceo/tech_lead confirms → status = 'confirmed', stock updated

alter table grns
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'confirmed'));

-- Backfill: any GRNs that existed before this migration were already processed
-- under the old single-step flow, so treat them as confirmed.
update grns set status = 'confirmed' where status = 'pending';
n
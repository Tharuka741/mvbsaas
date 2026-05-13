-- Customers table
-- Run this in the Supabase SQL editor

create table if not exists customers (
  id         bigint generated always as identity primary key,
  client     text not null,  -- company / business name (required)
  contact    text,           -- contact person name (optional)
  phone      text,           -- phone number (optional)
  created_at timestamptz not null default now()
);

-- Row-level security
alter table customers enable row level security;

create policy "anon select customers" on customers for select using (true);
create policy "anon insert customers" on customers for insert with check (true);
create policy "anon delete customers" on customers for delete using (true);
create policy "anon update customers" on customers for update using (true);

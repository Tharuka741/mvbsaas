-- Suppliers table
-- Run this in the Supabase SQL editor

create table if not exists suppliers (
  id         bigint generated always as identity primary key,
  name       text not null,
  contact    text,
  phone      text,
  created_at timestamptz not null default now()
);

alter table suppliers enable row level security;

create policy "anon select suppliers" on suppliers for select using (true);
create policy "anon insert suppliers" on suppliers for insert with check (true);
create policy "anon update suppliers" on suppliers for update using (true);
create policy "anon delete suppliers" on suppliers for delete using (true);

-- Run in Supabase SQL editor after migration-admin-permissions.sql
-- Supports cascading filters on the Activity Log page: choosing a User
-- narrows the Module dropdown to only modules that user has actually
-- logged, and choosing a Module narrows the Action dropdown the same way.
--
-- PostgREST has no generic "distinct" query param, so this is done with
-- two small RPC functions the log viewer calls (supabase-js .rpc(...)).
-- Both are plain SQL functions (not SECURITY DEFINER), so they execute
-- with the caller's own privileges — the existing "power read" RLS policy
-- on audit_logs applies exactly as it would to a direct select, meaning a
-- non-power-user calling these simply gets an empty list back, not an error.

create index if not exists audit_logs_user_module_action_idx
  on audit_logs (user_id, module, action);

create or replace function audit_log_distinct_modules(p_user_id uuid default null)
returns table(module text) language sql stable as $$
  select distinct module from audit_logs
  where p_user_id is null or user_id = p_user_id
  order by module;
$$;

create or replace function audit_log_distinct_actions(p_user_id uuid default null, p_module text default null)
returns table(action text) language sql stable as $$
  select distinct action from audit_logs
  where (p_user_id is null or user_id = p_user_id)
    and (p_module is null or module = p_module)
  order by action;
$$;

grant execute on function audit_log_distinct_modules(uuid) to authenticated;
grant execute on function audit_log_distinct_actions(uuid, text) to authenticated;

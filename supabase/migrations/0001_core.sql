-- Phase 1: report cache and per-install rate limiting.
-- Run in the Supabase SQL editor, or with `supabase db push`.

-- One row per analysed listing version. The cache key is
-- portal + listing ID + a hash of the sorted photo URLs, so a listing whose
-- photos change gets a new row. Photo URLs are stored; image files are not.
create table if not exists analyses (
  cache_key   text primary key,
  portal      text not null,
  listing_id  text not null,
  listing_url text not null,
  listing     jsonb not null,
  report      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists analyses_portal_listing_idx on analyses (portal, listing_id);

-- New (uncached) analyses started per anonymous install ID per UTC day.
create table if not exists analysis_usage (
  install_id text not null,
  day        date not null,
  count      integer not null default 0,
  primary key (install_id, day)
);

-- Only the server (service-role key) touches these tables. Row level
-- security with no policies keeps the anon and authenticated roles out.
alter table analyses enable row level security;
alter table analysis_usage enable row level security;

-- Atomically counts one analysis against today's allowance.
-- Returns false, counting nothing, when the allowance is used up.
create or replace function consume_analysis_quota(p_install_id text, p_limit integer)
returns boolean
language plpgsql
as $$
declare
  new_count integer;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into analysis_usage as usage (install_id, day, count)
  values (p_install_id, (now() at time zone 'utc')::date, 1)
  on conflict (install_id, day) do update
    set count = usage.count + 1
    where usage.count < p_limit
  returning usage.count into new_count;

  return new_count is not null;
end;
$$;

-- Gives one unit back after an analysis that failed.
create or replace function refund_analysis_quota(p_install_id text)
returns void
language sql
as $$
  update analysis_usage
  set count = count - 1
  where install_id = p_install_id
    and day = (now() at time zone 'utc')::date
    and count > 0;
$$;

revoke execute on function consume_analysis_quota(text, integer) from public, anon, authenticated;
revoke execute on function refund_analysis_quota(text) from public, anon, authenticated;

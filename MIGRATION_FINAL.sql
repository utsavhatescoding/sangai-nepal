-- Sangai Final migration
-- Safe to run on the existing Phase 1 Supabase project.
-- This preserves existing accounts, vehicles, rides, requests and messages.

begin;

-- 1) Fix vehicle owner read-after-insert and preserve accepted-passenger access.
drop policy if exists "Authorized users read vehicles" on public.vehicles;
create policy "Authorized users read vehicles"
on public.vehicles
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or public.can_access_vehicle(id)
);

drop policy if exists "Owners create vehicles" on public.vehicles;
create policy "Owners create vehicles"
on public.vehicles
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "Owners update vehicles" on public.vehicles;
create policy "Owners update vehicles"
on public.vehicles
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- 2) Real safety reporting.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  ride_id uuid references public.rides(id) on delete set null,
  category text not null check (category in ('safety','identity','vehicle','harassment','payment','other')),
  details text not null check (char_length(details) between 10 and 1000),
  reference_text text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.reports enable row level security;

drop policy if exists "Users create reports" on public.reports;
create policy "Users create reports"
on public.reports
for insert
to authenticated
with check (reported_by = (select auth.uid()));

drop policy if exists "Users read own reports" on public.reports;
create policy "Users read own reports"
on public.reports
for select
to authenticated
using (reported_by = (select auth.uid()));

grant select, insert on public.reports to authenticated;

-- 3) Public profile photo storage. Users may only write inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public avatar read" on storage.objects;
create policy "Public avatar read"
on storage.objects
for select
using (bucket_id = 'avatars');

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 4) Drivers can edit practical details of an upcoming ride without touching seat counts.
create or replace function public.update_ride_details(
  p_ride_id uuid,
  p_pickup_point text,
  p_dropoff_point text,
  p_departure_date date,
  p_departure_time time,
  p_duration_minutes integer,
  p_price_per_seat numeric,
  p_luggage text,
  p_stops text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ride public.rides%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_ride
  from public.rides
  where id = p_ride_id
  for update;

  if not found then raise exception 'Ride not found'; end if;
  if v_ride.driver_id <> v_user then raise exception 'Only the driver can edit this ride'; end if;
  if v_ride.status not in ('published','full') then raise exception 'This ride can no longer be edited'; end if;
  if p_departure_date < current_date then raise exception 'Departure date cannot be in the past'; end if;
  if p_duration_minutes < 15 or p_duration_minutes > 1440 then raise exception 'Invalid journey duration'; end if;
  if p_price_per_seat < 0 then raise exception 'Contribution cannot be negative'; end if;

  update public.rides
  set pickup_point = trim(p_pickup_point),
      dropoff_point = trim(p_dropoff_point),
      departure_date = p_departure_date,
      departure_time = p_departure_time,
      duration_minutes = p_duration_minutes,
      price_per_seat = p_price_per_seat,
      luggage = trim(p_luggage),
      stops = coalesce(p_stops, '{}'),
      updated_at = now()
  where id = p_ride_id;

  insert into public.notifications(user_id, type, title, body, ride_id, request_id)
  select
    sr.passenger_id,
    'ride_updated',
    'Journey details changed',
    'The driver updated the departure, pickup or journey details. Please review the ride again.',
    p_ride_id,
    sr.id
  from public.seat_requests sr
  where sr.ride_id = p_ride_id
    and sr.status in ('requested','accepted');
end;
$$;

revoke all on function public.update_ride_details(uuid,text,text,date,time,integer,numeric,text,text[]) from public, anon;
grant execute on function public.update_ride_details(uuid,text,text,date,time,integer,numeric,text,text[]) to authenticated;

commit;

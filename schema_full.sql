-- Sangai Phase 1 — Supabase database, authentication data and Row Level Security
-- Run this entire file once in Supabase > SQL Editor.
-- The browser must use only the public publishable/anon key, never service_role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Sangai member',
  city text,
  avatar_url text,
  bio text,
  travel_preferences text[] not null default array['No smoking','Music is okay'],
  average_rating numeric(2,1) not null default 0 check (average_rating between 0 and 5),
  completed_rides integer not null default 0 check (completed_rides >= 0),
  phone_verified boolean not null default false,
  identity_verified boolean not null default false,
  licence_verified boolean not null default false,
  vehicle_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.private_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  colour text not null,
  plate_number text not null,
  seats integer not null default 4 check (seats between 2 and 12),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, plate_number)
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  origin text not null,
  destination text not null,
  pickup_point text not null,
  dropoff_point text not null,
  stops text[] not null default '{}',
  departure_date date not null,
  departure_time time not null,
  duration_minutes integer not null check (duration_minutes between 15 and 1440),
  flexibility_minutes integer not null default 0 check (flexibility_minutes in (0,15,30,60)),
  total_seats integer not null check (total_seats between 1 and 8),
  available_seats integer not null check (available_seats between 0 and 8),
  price_per_seat numeric(10,2) not null check (price_per_seat >= 0),
  luggage text not null default 'Small bag only',
  approval_mode text not null default 'review' check (approval_mode in ('review','instant')),
  vehicle_model text not null,
  vehicle_colour text not null,
  vehicle_plate_masked text not null,
  no_smoking boolean not null default true,
  music_ok boolean not null default true,
  women_preferred boolean not null default false,
  pets_allowed boolean not null default false,
  status text not null default 'published' check (status in ('published','full','departing','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rides_seat_consistency check (available_seats <= total_seats)
);

create table if not exists public.seat_requests (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  requested_seats integer not null default 1 check (requested_seats between 1 and 4),
  pickup_point text not null,
  luggage text not null,
  message text not null check (char_length(message) between 2 and 300),
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ride_id, passenger_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  request_id uuid not null unique references public.seat_requests(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_rides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ride_id uuid not null references public.rides(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, ride_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  ride_id uuid references public.rides(id) on delete cascade,
  request_id uuid references public.seat_requests(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique(ride_id, reviewer_id, reviewed_user_id),
  constraint cannot_review_self check (reviewer_id <> reviewed_user_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists rides_search_idx on public.rides(status, departure_date, departure_time);
create index if not exists rides_driver_idx on public.rides(driver_id, departure_date desc);
create index if not exists seat_requests_ride_idx on public.seat_requests(ride_id, status);
create index if not exists seat_requests_passenger_idx on public.seat_requests(passenger_id, created_at desc);
create index if not exists conversations_driver_idx on public.conversations(driver_id, created_at desc);
create index if not exists conversations_passenger_idx on public.conversations(passenger_id, created_at desc);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists notifications_user_idx on public.notifications(user_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists private_profiles_set_updated_at on public.private_profiles;
create trigger private_profiles_set_updated_at before update on public.private_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute procedure public.set_updated_at();

drop trigger if exists rides_set_updated_at on public.rides;
create trigger rides_set_updated_at before update on public.rides
for each row execute procedure public.set_updated_at();

drop trigger if exists seat_requests_set_updated_at on public.seat_requests;
create trigger seat_requests_set_updated_at before update on public.seat_requests
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Create profile records automatically after signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, city)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1), 'Sangai member'),
    nullif(new.raw_user_meta_data->>'city','')
  )
  on conflict (id) do nothing;

  insert into public.private_profiles(user_id, phone)
  values (new.id, nullif(new.raw_user_meta_data->>'phone',''))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill profile rows if authentication users existed before this schema was run.
insert into public.profiles(id, full_name)
select id, coalesce(nullif(raw_user_meta_data->>'full_name',''), split_part(email,'@',1), 'Sangai member')
from auth.users
on conflict (id) do nothing;

insert into public.private_profiles(user_id, phone)
select id, nullif(raw_user_meta_data->>'phone','')
from auth.users
on conflict (user_id) do nothing;

-- Reset trust badges whenever a user changes information that was reviewed.
create or replace function public.reset_profile_verification_on_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.full_name is distinct from new.full_name then
    new.identity_verified := false;
    new.licence_verified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reset_verification on public.profiles;
create trigger profiles_reset_verification
before update on public.profiles
for each row execute procedure public.reset_profile_verification_on_change();

create or replace function public.reset_phone_verification_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.phone is distinct from new.phone then
    update public.profiles set phone_verified=false where id=new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists private_profiles_reset_phone_verification on public.private_profiles;
create trigger private_profiles_reset_phone_verification
after update on public.private_profiles
for each row execute procedure public.reset_phone_verification_on_change();

create or replace function public.reset_vehicle_verification_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.model is distinct from new.model
     or old.colour is distinct from new.colour
     or old.plate_number is distinct from new.plate_number then
    new.is_verified := false;
    update public.profiles set vehicle_verified=false where id=new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_reset_verification on public.vehicles;
create trigger vehicles_reset_verification
before update on public.vehicles
for each row execute procedure public.reset_vehicle_verification_on_change();

-- Keep public profile ratings derived from actual review rows.
create or replace function public.recalculate_profile_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    v_user := old.reviewed_user_id;
  else
    v_user := new.reviewed_user_id;
  end if;

  update public.profiles p
  set average_rating = coalesce((select round(avg(r.rating)::numeric,1) from public.reviews r where r.reviewed_user_id=v_user),0)
  where p.id=v_user;
  return null;
end;
$$;

drop trigger if exists reviews_recalculate_rating on public.reviews;
create trigger reviews_recalculate_rating
after insert or update or delete on public.reviews
for each row execute procedure public.recalculate_profile_rating();

-- ---------------------------------------------------------------------------
-- Security helper functions used by RLS
-- ---------------------------------------------------------------------------

create or replace function public.is_ride_driver(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.rides r
    where r.id = p_ride_id and r.driver_id = auth.uid()
  );
$$;

create or replace function public.is_ride_participant(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.rides r
    where r.id = p_ride_id and r.driver_id = auth.uid()
  ) or exists(
    select 1 from public.seat_requests sr
    where sr.ride_id = p_ride_id
      and sr.passenger_id = auth.uid()
      and sr.status in ('requested','accepted','completed')
  );
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.driver_id, c.passenger_id)
  );
$$;

create or replace function public.can_access_vehicle(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.vehicles v
    where v.id = p_vehicle_id and v.owner_id = auth.uid()
  ) or exists(
    select 1
    from public.rides r
    join public.seat_requests sr on sr.ride_id = r.id
    where r.vehicle_id = p_vehicle_id
      and sr.passenger_id = auth.uid()
      and sr.status in ('accepted','completed')
  );
$$;

grant execute on function public.is_ride_driver(uuid) to authenticated;
grant execute on function public.is_ride_participant(uuid) to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.can_access_vehicle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.private_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.rides enable row level security;
alter table public.seat_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.saved_rides enable row level security;
alter table public.notifications enable row level security;
alter table public.reviews enable row level security;

-- Profiles contain only public-safe information.
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles
for select using (true);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Private contact information is owner-only.
drop policy if exists "Users read own private profile" on public.private_profiles;
create policy "Users read own private profile" on public.private_profiles
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own private profile" on public.private_profiles;
create policy "Users insert own private profile" on public.private_profiles
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own private profile" on public.private_profiles;
create policy "Users update own private profile" on public.private_profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Vehicle number is visible only to the owner and accepted passengers.
drop policy if exists "Authorized users read vehicles" on public.vehicles;
create policy "Authorized users read vehicles" on public.vehicles
for select to authenticated using (
  owner_id = (select auth.uid())
  or public.can_access_vehicle(id)
);

drop policy if exists "Owners create vehicles" on public.vehicles;
create policy "Owners create vehicles" on public.vehicles
for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners update vehicles" on public.vehicles;
create policy "Owners update vehicles" on public.vehicles
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners delete vehicles" on public.vehicles;
create policy "Owners delete vehicles" on public.vehicles
for delete to authenticated using ((select auth.uid()) = owner_id);

-- Future published rides are public; private statuses remain visible to participants.
drop policy if exists "Published rides are public" on public.rides;
create policy "Published rides are public" on public.rides
for select using (
  (status = 'published' and departure_date >= current_date)
  or public.is_ride_participant(id)
);

drop policy if exists "Drivers create own rides" on public.rides;
create policy "Drivers create own rides" on public.rides
for insert to authenticated with check (
  (select auth.uid()) = driver_id
  and status = 'published'
  and available_seats = total_seats
  and departure_date >= current_date
  and vehicle_id is not null
  and exists (
    select 1 from public.vehicles v
    where v.id=vehicle_id and v.owner_id=(select auth.uid()) and v.is_active=true
  )
);

-- Ride status and seat counts are changed only by the secured RPC functions.
drop policy if exists "Drivers update own rides" on public.rides;
drop policy if exists "Drivers delete own rides" on public.rides;

-- Seat requests can only be created/changed through RPC functions below.
drop policy if exists "Participants read seat requests" on public.seat_requests;
create policy "Participants read seat requests" on public.seat_requests
for select to authenticated using (
  passenger_id = (select auth.uid()) or public.is_ride_driver(ride_id)
);

-- Conversations and messages are private to the two participants.
drop policy if exists "Conversation participants read" on public.conversations;
create policy "Conversation participants read" on public.conversations
for select to authenticated using (
  (select auth.uid()) in (driver_id, passenger_id)
);

drop policy if exists "Conversation participants read messages" on public.messages;
create policy "Conversation participants read messages" on public.messages
for select to authenticated using (public.is_conversation_participant(conversation_id));

drop policy if exists "Conversation participants send messages" on public.messages;
create policy "Conversation participants send messages" on public.messages
for insert to authenticated with check (
  sender_id = (select auth.uid())
  and public.is_conversation_participant(conversation_id)
);

-- Saved rides and notifications are private.
drop policy if exists "Users read own saved rides" on public.saved_rides;
create policy "Users read own saved rides" on public.saved_rides
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users save rides" on public.saved_rides;
create policy "Users save rides" on public.saved_rides
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users remove saved rides" on public.saved_rides;
create policy "Users remove saved rides" on public.saved_rides
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users mark own notifications" on public.notifications;
create policy "Users mark own notifications" on public.notifications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Reviews are public; only completed participants can create them.
drop policy if exists "Reviews are public" on public.reviews;
create policy "Reviews are public" on public.reviews
for select using (true);

drop policy if exists "Completed participants create reviews" on public.reviews;
create policy "Completed participants create reviews" on public.reviews
for insert to authenticated with check (
  reviewer_id = (select auth.uid())
  and exists (
    select 1 from public.rides r
    where r.id = ride_id and r.status = 'completed'
      and (
        r.driver_id = (select auth.uid())
        or exists (
          select 1 from public.seat_requests sr
          where sr.ride_id = r.id
            and sr.passenger_id = (select auth.uid())
            and sr.status = 'completed'
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- Public route search RPC (returns only public-safe ride and driver fields)
-- ---------------------------------------------------------------------------

create or replace function public.search_rides(
  p_from text default null,
  p_to text default null,
  p_date date default null,
  p_seats integer default 1
)
returns table (
  id uuid,
  driver_id uuid,
  origin text,
  destination text,
  pickup_point text,
  dropoff_point text,
  stops text[],
  departure_date date,
  departure_time time,
  duration_minutes integer,
  flexibility_minutes integer,
  total_seats integer,
  available_seats integer,
  price_per_seat numeric,
  luggage text,
  approval_mode text,
  vehicle_model text,
  vehicle_colour text,
  vehicle_plate_masked text,
  no_smoking boolean,
  music_ok boolean,
  women_preferred boolean,
  pets_allowed boolean,
  status text,
  driver_name text,
  driver_avatar_url text,
  driver_rating numeric,
  driver_completed_rides integer,
  driver_phone_verified boolean,
  driver_identity_verified boolean,
  driver_licence_verified boolean,
  driver_vehicle_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.driver_id,
    r.origin,
    r.destination,
    r.pickup_point,
    r.dropoff_point,
    r.stops,
    r.departure_date,
    r.departure_time,
    r.duration_minutes,
    r.flexibility_minutes,
    r.total_seats,
    r.available_seats,
    r.price_per_seat,
    r.luggage,
    r.approval_mode,
    r.vehicle_model,
    r.vehicle_colour,
    r.vehicle_plate_masked,
    r.no_smoking,
    r.music_ok,
    r.women_preferred,
    r.pets_allowed,
    r.status,
    p.full_name,
    p.avatar_url,
    p.average_rating,
    p.completed_rides,
    p.phone_verified,
    p.identity_verified,
    p.licence_verified,
    p.vehicle_verified
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  where r.status = 'published'
    and r.departure_date >= current_date
    and r.available_seats >= greatest(coalesce(p_seats,1),1)
    and (p_date is null or r.departure_date = p_date)
    and (
      coalesce(trim(p_from),'') = ''
      or lower(r.origin) like '%' || lower(trim(p_from)) || '%'
      or lower(r.pickup_point) like '%' || lower(trim(p_from)) || '%'
      or exists(select 1 from unnest(r.stops) as stop(stop_name) where lower(stop.stop_name) like '%' || lower(trim(p_from)) || '%')
    )
    and (
      coalesce(trim(p_to),'') = ''
      or lower(r.destination) like '%' || lower(trim(p_to)) || '%'
      or lower(r.dropoff_point) like '%' || lower(trim(p_to)) || '%'
      or exists(select 1 from unnest(r.stops) as stop(stop_name) where lower(stop.stop_name) like '%' || lower(trim(p_to)) || '%')
    )
  order by r.departure_date, r.departure_time;
$$;

grant execute on function public.search_rides(text,text,date,integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic seat-request functions
-- ---------------------------------------------------------------------------

create or replace function public.create_seat_request(
  p_ride_id uuid,
  p_requested_seats integer,
  p_pickup_point text,
  p_luggage text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ride public.rides%rowtype;
  v_request_id uuid;
  v_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_requested_seats < 1 or p_requested_seats > 4 then raise exception 'Invalid seat count'; end if;
  if char_length(trim(p_message)) < 2 then raise exception 'Please add a short introduction'; end if;

  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.driver_id = v_user then raise exception 'You cannot request your own ride'; end if;
  if v_ride.status <> 'published' then raise exception 'This ride is not accepting requests'; end if;
  if v_ride.departure_date < current_date then raise exception 'This ride has already departed'; end if;
  if v_ride.available_seats < p_requested_seats then raise exception 'Not enough seats are available'; end if;

  v_status := case when v_ride.approval_mode = 'instant' then 'accepted' else 'requested' end;

  insert into public.seat_requests(
    ride_id, passenger_id, requested_seats, pickup_point, luggage, message, status
  ) values (
    p_ride_id, v_user, p_requested_seats, trim(p_pickup_point), trim(p_luggage), trim(p_message), v_status
  ) returning id into v_request_id;

  insert into public.conversations(ride_id, request_id, driver_id, passenger_id)
  values (p_ride_id, v_request_id, v_ride.driver_id, v_user);

  if v_status = 'accepted' then
    update public.rides
    set available_seats = available_seats - p_requested_seats,
        status = case when available_seats - p_requested_seats = 0 then 'full' else status end
    where id = p_ride_id;
  end if;

  insert into public.notifications(user_id, type, title, body, ride_id, request_id)
  values (
    v_ride.driver_id,
    'seat_request',
    case when v_status='accepted' then 'A passenger joined instantly' else 'New seat request' end,
    'Open My journeys to review the passenger and pickup request.',
    p_ride_id,
    v_request_id
  );

  return v_request_id;
exception
  when unique_violation then
    raise exception 'You already requested this ride';
end;
$$;

grant execute on function public.create_seat_request(uuid,integer,text,text,text) to authenticated;

create or replace function public.respond_to_seat_request(
  p_request_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_request public.seat_requests%rowtype;
  v_ride public.rides%rowtype;
  v_new_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_action not in ('accept','decline') then raise exception 'Invalid action'; end if;

  select * into v_request from public.seat_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;

  select * into v_ride from public.rides where id = v_request.ride_id for update;
  if v_ride.driver_id <> v_user then raise exception 'Only the driver can respond'; end if;
  if v_request.status <> 'requested' then return v_request.status; end if;

  if p_action = 'accept' then
    if v_ride.status not in ('published','full') then raise exception 'Ride is not accepting passengers'; end if;
    if v_ride.available_seats < v_request.requested_seats then raise exception 'Not enough seats remain'; end if;

    update public.seat_requests set status='accepted' where id=p_request_id;
    update public.rides
    set available_seats = available_seats - v_request.requested_seats,
        status = case when available_seats - v_request.requested_seats = 0 then 'full' else 'published' end
    where id = v_ride.id;
    v_new_status := 'accepted';
  else
    update public.seat_requests set status='declined' where id=p_request_id;
    v_new_status := 'declined';
  end if;

  insert into public.notifications(user_id, type, title, body, ride_id, request_id)
  values (
    v_request.passenger_id,
    'request_' || v_new_status,
    case when v_new_status='accepted' then 'Your seat request was accepted' else 'Your seat request was declined' end,
    case when v_new_status='accepted' then 'Open Messages to coordinate the pickup privately.' else 'You can search for another ride on the same route.' end,
    v_ride.id,
    v_request.id
  );

  return v_new_status;
end;
$$;

grant execute on function public.respond_to_seat_request(uuid,text) to authenticated;

create or replace function public.cancel_seat_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_request public.seat_requests%rowtype;
  v_ride public.rides%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_request from public.seat_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.passenger_id <> v_user then raise exception 'Only the passenger can cancel'; end if;
  if v_request.status in ('cancelled','declined','completed') then return v_request.status; end if;

  select * into v_ride from public.rides where id=v_request.ride_id for update;
  if v_ride.status in ('departing','in_progress','completed') then raise exception 'This request can no longer be cancelled in the app'; end if;

  if v_request.status='accepted' and v_ride.status not in ('completed','cancelled') then
    update public.rides
    set available_seats = least(total_seats, available_seats + v_request.requested_seats),
        status = case when status='full' then 'published' else status end
    where id=v_ride.id;
  end if;

  update public.seat_requests set status='cancelled' where id=p_request_id;

  insert into public.notifications(user_id, type, title, body, ride_id, request_id)
  values (v_ride.driver_id, 'request_cancelled', 'Passenger cancelled the request', 'The seat has been returned to the ride.', v_ride.id, v_request.id);

  return 'cancelled';
end;
$$;

grant execute on function public.cancel_seat_request(uuid) to authenticated;


create or replace function public.get_accepted_request_details(p_request_id uuid)
returns table (
  ride_id uuid,
  driver_name text,
  driver_phone text,
  passenger_name text,
  passenger_phone text,
  vehicle_model text,
  vehicle_colour text,
  vehicle_plate_number text,
  pickup_point text,
  dropoff_point text,
  departure_date date,
  departure_time time
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_request public.seat_requests%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_request from public.seat_requests where id=p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status not in ('accepted','completed') then raise exception 'Details are available only after acceptance'; end if;

  if not exists(
    select 1 from public.rides r
    where r.id=v_request.ride_id
      and (r.driver_id=v_user or v_request.passenger_id=v_user)
  ) then raise exception 'Not authorized'; end if;

  return query
  select
    r.id,
    dp.full_name,
    dpp.phone,
    pp.full_name,
    ppp.phone,
    v.model,
    v.colour,
    v.plate_number,
    v_request.pickup_point,
    r.dropoff_point,
    r.departure_date,
    r.departure_time
  from public.rides r
  join public.profiles dp on dp.id=r.driver_id
  join public.private_profiles dpp on dpp.user_id=r.driver_id
  join public.profiles pp on pp.id=v_request.passenger_id
  join public.private_profiles ppp on ppp.user_id=v_request.passenger_id
  left join public.vehicles v on v.id=r.vehicle_id
  where r.id=v_request.ride_id;
end;
$$;

revoke all on function public.get_accepted_request_details(uuid) from public, anon;
grant execute on function public.get_accepted_request_details(uuid) to authenticated;

create or replace function public.update_ride_status(
  p_ride_id uuid,
  p_new_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ride public.rides%rowtype;
  v_passengers integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_new_status not in ('published','departing','in_progress','completed','cancelled') then
    raise exception 'Invalid ride status';
  end if;

  select * into v_ride from public.rides where id=p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.driver_id <> v_user then raise exception 'Only the driver can update this ride'; end if;

  if p_new_status='departing' and v_ride.status not in ('published','full') then raise exception 'Invalid status transition'; end if;
  if p_new_status='in_progress' and v_ride.status <> 'departing' then raise exception 'Mark the ride departing before starting'; end if;
  if p_new_status='completed' and v_ride.status <> 'in_progress' then raise exception 'Start the journey before completing it'; end if;
  if p_new_status='published' and v_ride.status not in ('published','full') then raise exception 'Invalid status transition'; end if;

  update public.rides set status=p_new_status where id=p_ride_id;

  if p_new_status='completed' and v_ride.status <> 'completed' then
    update public.seat_requests
    set status='completed'
    where ride_id=p_ride_id and status='accepted';

    select count(*) into v_passengers
    from public.seat_requests
    where ride_id=p_ride_id and status='completed';

    if v_passengers > 0 then
      update public.profiles
      set completed_rides=completed_rides+1
      where id=v_ride.driver_id;

      update public.profiles p
      set completed_rides=completed_rides+1
      where p.id in (
        select passenger_id from public.seat_requests
        where ride_id=p_ride_id and status='completed'
      );
    end if;

    insert into public.notifications(user_id,type,title,body,ride_id)
    select passenger_id,'ride_completed','Journey completed','You can now leave a review for this journey.',p_ride_id
    from public.seat_requests where ride_id=p_ride_id and status='completed';
  elsif p_new_status='cancelled' and v_ride.status <> 'cancelled' then
    insert into public.notifications(user_id,type,title,body,ride_id,request_id)
    select passenger_id,'ride_cancelled','Driver cancelled the journey','Open Find a seat to search for another ride.',p_ride_id,id
    from public.seat_requests
    where ride_id=p_ride_id and status in ('requested','accepted');

    update public.seat_requests
    set status='cancelled'
    where ride_id=p_ride_id and status in ('requested','accepted');
  end if;

  return p_new_status;
end;
$$;

grant execute on function public.update_ride_status(uuid,text) to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_conversation_participant(p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> auth.uid()
    and read_at is null;
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit API privileges and function execution restrictions
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.rides, public.reviews to anon, authenticated;

grant select, insert, update, delete on public.private_profiles, public.seat_requests,
  public.conversations, public.messages, public.saved_rides, public.notifications to authenticated;

grant select on public.rides, public.reviews to authenticated;
grant insert(driver_id, vehicle_id, origin, destination, pickup_point, dropoff_point, stops,
  departure_date, departure_time, duration_minutes, flexibility_minutes, total_seats,
  available_seats, price_per_seat, luggage, approval_mode, vehicle_model, vehicle_colour,
  vehicle_plate_masked, no_smoking, music_ok, women_preferred, pets_allowed) on public.rides to authenticated;
grant insert on public.reviews to authenticated;
grant update(full_name, city, avatar_url, bio, travel_preferences) on public.profiles to authenticated;

grant select on public.vehicles to authenticated;
grant insert(owner_id, model, colour, plate_number, seats, is_active) on public.vehicles to authenticated;
grant update(model, colour, plate_number, seats, is_active) on public.vehicles to authenticated;
grant delete on public.vehicles to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.recalculate_profile_rating() from public, anon, authenticated;
revoke all on function public.reset_profile_verification_on_change() from public, anon, authenticated;
revoke all on function public.reset_phone_verification_on_change() from public, anon, authenticated;
revoke all on function public.reset_vehicle_verification_on_change() from public, anon, authenticated;
revoke all on function public.create_seat_request(uuid,integer,text,text,text) from public, anon;
revoke all on function public.respond_to_seat_request(uuid,text) from public, anon;
revoke all on function public.cancel_seat_request(uuid) from public, anon;
revoke all on function public.update_ride_status(uuid,text) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;

grant execute on function public.create_seat_request(uuid,integer,text,text,text) to authenticated;
grant execute on function public.respond_to_seat_request(uuid,text) to authenticated;
grant execute on function public.cancel_seat_request(uuid) to authenticated;
grant execute on function public.update_ride_status(uuid,text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime tables
-- ---------------------------------------------------------------------------

do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.seat_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.rides; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;

alter table public.messages replica identity full;
alter table public.seat_requests replica identity full;
alter table public.rides replica identity full;
alter table public.notifications replica identity full;


-- Final release additions
-- Sangai Final migration
-- Safe to run on the existing Phase 1 Supabase project.
-- This preserves existing accounts, vehicles, rides, requests and messages.


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


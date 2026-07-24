-- Sangai Phase 1 — useful manual admin queries
-- Use only from the Supabase SQL Editor as the project owner.

-- Find a user by email (auth schema is visible in SQL Editor):
-- select id, email, created_at from auth.users order by created_at desc;

-- Mark a user as manually verified after checking documents:
-- update public.profiles
-- set phone_verified=true,
--     identity_verified=true,
--     licence_verified=true,
--     vehicle_verified=true
-- where id='PASTE-USER-UUID-HERE';

-- View recently published rides:
select id, origin, destination, departure_date, departure_time, available_seats, status, driver_id
from public.rides
order by created_at desc
limit 50;

-- View open seat requests:
select sr.id, sr.status, sr.requested_seats, sr.pickup_point,
       passenger.full_name as passenger,
       r.origin, r.destination, driver.full_name as driver
from public.seat_requests sr
join public.rides r on r.id=sr.ride_id
join public.profiles passenger on passenger.id=sr.passenger_id
join public.profiles driver on driver.id=r.driver_id
where sr.status in ('requested','accepted')
order by sr.created_at desc;

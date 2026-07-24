# Live Product Audit — Fixes Included

## Production credibility
- Removed prototype, Phase 1 and pilot language from the public interface.
- Standardised the brand to Sangai / सँगै.
- Added real metadata, favicon, PWA manifest and installable app shell.
- Removed the non-functional language selector.

## Search and routes
- Expanded Nepal places from 21 to more than 100 cities, areas and highway landmarks.
- Added common aliases such as KTM, PKR, Chitwan and Narayangadh.
- Added more realistic popular intercity corridors.
- Clarified that this is planned seat sharing, not taxi booking.

## Ride cards
- Verification wording now reflects actual status.
- Real profile photos are shown when available.
- Full contact and vehicle details remain private until acceptance.
- Driver ride cards now support secure editing.

## Profiles
- Added public profile-photo upload through a restricted Supabase Storage bucket.
- Added real preference editing.
- Added vehicle list and verification status.
- Removed hard-coded 75% verification displays.
- Added public biography display.

## Safety
- Replaced the placeholder report button with a database-backed report form.
- Added privacy and community-terms content.
- Kept emergency wording clear: the platform is not an emergency service.

## Database
- Included the vehicle RLS fix.
- Added reports with owner-only access.
- Added secure avatar storage policies.
- Added an atomic driver-only ride-edit function.

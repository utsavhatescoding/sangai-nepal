# Upgrade the Live Sangai Site

## Important
Your existing Supabase data is preserved. Do **not** run the old schema again.

## 1. Back up your current config
Open the currently working `config.js` in GitHub and copy:
- `supabaseUrl`
- `supabasePublishableKey`

Keep them private from chat messages, but the publishable key is safe in the browser when RLS is enabled.

## 2. Run the migration
In Supabase → SQL Editor:
1. Open `supabase/MIGRATION_FINAL.sql`
2. Copy all
3. Run it once
4. Confirm `Success. No rows returned.`

This:
- keeps the vehicle RLS fix
- adds real safety reports
- adds public profile-photo storage
- adds secure ride editing

## 3. Add your config
Paste the two working values into the new `config.js`.

## 4. Replace GitHub files
Replace the files in your current repository with this package. Do not upload the ZIP itself.

## 5. Netlify deployment
Netlify should redeploy automatically. After it finishes:
- open the site in a private window
- hard refresh once
- test login, search, ride publishing, profile photo, request, acceptance and messaging

## 6. Clear stale service worker once
On the first update only, a hard refresh is recommended:
- Mac Chrome: `Command + Shift + R`
- Safari: Develop → Empty Caches, then refresh

## 7. Two-account production test
Driver:
1. Log in
2. Add profile and photo
3. Publish a future ride
4. Confirm it appears in Find

Passenger:
1. Open private/incognito window
2. Create another account
3. Find the ride
4. Request a seat

Driver:
1. Open My journeys
2. Accept
3. Edit pickup time once
4. Confirm passenger gets a notification
5. Send a message

Passenger:
1. Confirm accepted status
2. Confirm private details appear
3. Reply in Messages

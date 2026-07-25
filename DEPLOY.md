# Deploy the Sangai Business Redesign

## 1. Keep your current Supabase config
Do not delete your working `config.js`. This package intentionally does not include it.

## 2. Enable profile photos
In Supabase → SQL Editor, run:

`supabase/MIGRATION_AVATARS.sql`

It creates a restricted `avatars` storage bucket. Existing data is preserved.

## 3. Replace frontend files
Replace these files in the repository root:
- `index.html`
- `styles.css`
- `app.js`
- `netlify.toml`
- `manifest.webmanifest`
- `service-worker.js`
- `robots.txt`
- `sitemap.xml`

Upload the full `assets` folder.

Keep your existing:
- `config.js`
- database tables and RLS policies
- other Supabase SQL files

## 4. Deploy
Commit to the branch connected to Netlify. Use **Clear cache and deploy site** once.

## 5. Link preview
The HTML points to:

`https://sangaijaum.netlify.app/assets/sangai-share.png`

After deployment, paste the link into WhatsApp, Facebook or LinkedIn. Social platforms may cache the previous preview, so use their sharing debugger or wait for the cache to refresh.

## 6. Test
- Driver login
- Passenger login
- Publish a ride
- Request and accept a seat
- Messages
- Profile photo upload
- Mobile layout

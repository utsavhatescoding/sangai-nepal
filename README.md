# Sangai Phase 1 — Real Database-Backed Product

This release converts the approved browser prototype into a shared Supabase application.

Once the one-time setup below is completed, different users on different devices can:

- create accounts and log in
- publish real rides to a shared database
- search the same live departure board
- request one or more seats
- accept or decline requests safely
- avoid double-booking the final seat
- message privately in real time
- save rides
- manage driver and passenger journeys
- update a real profile
- see genuine verification status stored in the database

## What is inside

- `index.html` — full responsive application interface
- `styles.css` — approved Sangai visual design
- `app.js` — Supabase authentication, database and Realtime logic
- `config.js` — your two public Supabase connection values
- `supabase/schema.sql` — complete database, functions and Row Level Security
- `supabase/admin_queries.sql` — basic manual pilot administration queries
- `netlify.toml` — Netlify deployment configuration
- `TESTING.md` — two-account end-to-end testing steps

## Important limitation

The code is complete, but a Supabase project cannot be created from inside this file package. You must create the free project under your own account and paste its two public connection values into `config.js`.

That is the only external setup required to activate the shared product.

---

# One-time setup

## Step 1 — Create the Supabase project

1. Sign in to Supabase.
2. Choose **New project**.
3. Project name: `sangai-nepal`.
4. Create and safely save the database password.
5. Choose the closest available region.
6. Wait until the project dashboard opens.

## Step 2 — Create the database

1. Open **SQL Editor** in Supabase.
2. Choose **New query**.
3. Open `supabase/schema.sql` from this package.
4. Copy the entire SQL file.
5. Paste it into the SQL Editor.
6. Click **Run**.

The SQL creates:

- public profiles
- private contact profiles
- vehicles
- rides
- seat requests
- private conversations
- messages
- saved rides
- notifications
- reviews
- secure Row Level Security policies
- atomic seat-request functions
- Realtime table publication

Do not create these tables manually before running the SQL.

## Step 3 — Configure email authentication

Open **Authentication → URL Configuration**.

During local testing, add:

```text
http://localhost:5500
```

After Netlify deployment, set the Site URL to the final Netlify address and add it to Redirect URLs.

For the first closed test, you may either:

- keep email confirmation enabled and confirm every account by email, or
- temporarily disable email confirmation under Authentication settings for faster testing.

Enable confirmation again before a wider public pilot.

## Step 4 — Connect the frontend

Open **Project Settings → API** in Supabase.

Copy:

- Project URL
- Publishable key, or the legacy public `anon` key

Open `config.js` and paste them:

```js
window.SANGAI_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabasePublishableKey: "YOUR-PUBLIC-PUBLISHABLE-KEY"
};
```

Never place the `service_role` key in `config.js`.

## Step 5 — Run locally

Do not test authentication by double-clicking `index.html`.

Use a local server. The simplest option is VS Code Live Server:

1. Open this folder in VS Code.
2. Install **Live Server**.
3. Right-click `index.html`.
4. Choose **Open with Live Server**.

The usual local URL is:

```text
http://localhost:5500
```

## Step 6 — Test with two accounts

Follow `TESTING.md`.

The most important test is using two separate browser profiles:

- Account A publishes a ride as driver.
- Account B requests a seat as passenger.
- Account A accepts the request.
- Both accounts see the same database state and private conversation.

## Step 7 — Deploy free on Netlify

1. Create a GitHub repository named `sangai-nepal`.
2. Upload all files in this folder to the repository root.
3. In Netlify choose **Add new project → Import an existing project**.
4. Select the repository.
5. Leave Build command empty.
6. Set Publish directory to `.`.
7. Deploy.
8. Copy the Netlify URL.
9. Add that URL in Supabase **Authentication → URL Configuration**.

The public Supabase key is safe to include in browser code only because the database is protected by the included Row Level Security policies.

---

# What Phase 1 does not include

These are intentionally left for Phase 2:

- document image uploads
- automated citizenship/licence verification
- SMS OTP
- push notifications
- payment processing
- full admin web dashboard
- incident and blocking workflow
- map and GPS tracking
- production legal and insurance implementation

Verification flags in Phase 1 are real database fields, but only the project administrator should change them after manual review. Use `supabase/admin_queries.sql` as a starting point.

# Pilot operating rule

Do not mark a user, licence or vehicle as verified unless the document has actually been reviewed.

Start with one corridor and manually supervise the first rides.

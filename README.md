# Sangai Final — Production-Polished Intercity Seat Sharing

This package upgrades the existing Sangai Phase 1 deployment without deleting its database records.

## Included
- final Sangai brand and app icon
- cleaner production UI
- more than 100 Nepal cities and landmarks
- profile photo upload
- editable travel preferences
- vehicle profile section
- secure ride editing
- real safety-report submission
- PWA manifest and service worker
- fixed vehicle Row Level Security
- migration for the existing Supabase project
- complete fresh-project schema

## Existing live project
Follow `DEPLOY_UPDATE.md`.

Run only:

`supabase/MIGRATION_FINAL.sql`

Then copy your current working public Supabase values into `config.js` and replace the GitHub files.

## New project
Run:

`supabase/schema_full.sql`

Then configure `config.js`.

## Important
Sangai remains a controlled-pilot product. Before broad commercial use, confirm Nepal’s legal, insurance, private-vehicle, passenger-safety and platform-registration requirements.

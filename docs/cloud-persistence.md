# Nodes Cloud Persistence

This is the minimum cloud shape that fits the current product without forcing a full data-model rewrite.

## What moves to the cloud

Move these server-side stores out of `data/*.json` and into Postgres:

- sessions
- projects
- memory items
- project/session links
- project/memory links

Move these binary assets out of `data/session-blobs` and into object storage:

- uploaded images
- uploaded files
- artifact blobs referenced by sessions

## What can stay in localStorage

These values are UI preferences, not shared business data:

- session view mode (`chat`, `split`, `canvas`)
- split ratio
- history mode
- selected model/provider
- temporary graph focus state

Those can stay browser-local even after cloud migration.

## Recommended stack

- App hosting: Vercel
- Database: Supabase Postgres
- Blob storage: Supabase Storage
- Auth: keep Auth.js

This keeps the migration small because the app already has server-side auth and ownership checks.

## Env flags

Keep the current local filesystem backend until Supabase is configured:

- `NODES_PERSISTENCE_BACKEND=file`

Switch to cloud metadata persistence when these are present:

- `NODES_PERSISTENCE_BACKEND=supabase`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SESSION_ARTIFACTS_BUCKET=session-artifacts`

## Why the SQL schema is shaped this way

The current file stores already persist:

- session snapshots as JSON
- artifacts as JSON metadata
- context links as JSON metadata

So the fastest safe migration is:

- keep `snapshot`, `artifacts`, and `contextLinks` in `jsonb`
- normalize only the relationship-heavy parts:
  - project to session
  - project to memory

That gets Nodes to the cloud without a full domain-model rewrite.

## Tables

Defined in [schema.sql](C:\Users\daedu\Documents\Playground\AI Canvas\supabase\schema.sql):

- `sessions`
- `projects`
- `project_sessions`
- `memory_items`
- `project_memory_links`

And one private storage bucket:

- `session-artifacts`

## Migration order

1. Introduce repository interfaces around the current stores.
2. Add a Supabase-backed implementation for sessions, projects, and memory.
3. Move blob writes from local disk to Supabase Storage.
4. Add a one-time migration script to import:
   - `data/sessions/*.json`
   - `data/projects/*.json`
   - `data/memory/*.json`
   - `data/session-blobs/**`
5. Switch API routes from file stores to cloud repositories.
6. Only then remove the file-store implementation.

## Important production change

Today the API is guarded as local-first via:

- [api-access.ts](C:\Users\daedu\Documents\Playground\AI Canvas\lib\server\api-access.ts)
- [request-guards.ts](C:\Users\daedu\Documents\Playground\AI Canvas\lib\server\request-guards.ts)

For a cloud deployment, the production posture should become:

- authenticated user required
- ownership enforced server-side
- remote API allowed in production
- cross-site mutating requests still blocked by the API guard

Do not keep the app file-backed and simply toggle `ALLOW_REMOTE_API=1`; that would deploy the UI before the persistence layer is actually cloud-ready.

## Current status

Implemented:

- sessions
- projects
- memory
- artifact blob uploads to Supabase Storage
- one-time migration script from local `data/`
- Supabase CLI linked to the project for schema and query checks

Still intentionally lightweight:

- blob cleanup/maintenance against cloud storage
- file-backed repositories still exist as a local fallback
- there are no browser-side RLS policies yet because the app currently uses Auth.js plus server-side Supabase access

## Migration command

Once your Supabase project and storage bucket exist, import local data with:

```bash
npm run setup:supabase-storage
npm run migrate:supabase
```

If some older local files were created before ownership existed, set:

- `SUPABASE_MIGRATION_OWNER_ID`

so ownerless sessions, projects, and memory rows can be assigned to a real user id during import.

## Important limitation

This repo can automate:

- creating/verifying the `session-artifacts` bucket
- migrating local data into an existing Supabase project

It does **not** create the Supabase project itself. Project creation still requires:

- your authenticated Supabase dashboard session
- or your own Supabase management credentials outside this repo

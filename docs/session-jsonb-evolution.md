# Gradual session JSONB evolution

Phase 8 keeps the session JSONB documents as the materialized source used by the application while adding relational metadata that can evolve independently.

## Expansion model

The migration is additive and compatible with the previously deployed application:

- `sessions.schema_version` records the JSONB document contract. Existing rows and clients default to version 1.
- `sessions.message_count` is a stored generated column derived from `snapshot_json.messages`.
- `session_changes` is an append-only metadata ledger for created, baseline, and updated session versions.
- Version 1 constraints validate only the stable top-level shape. They do not constrain individual message, artifact, or context-link payloads.
- The optimistic `sessions.version` remains the write concurrency version and is intentionally separate from `schema_version`.

No JSONB content is rewritten, split, or removed in this phase. Blobs remain in Supabase Storage with relational lifecycle metadata from phase 3. Messages and context links can be extracted into relational tables in a later contract phase while the snapshot continues serving fast whole-document reads.

## Summary reads

`listSessions` selects only:

- `id`
- `title`
- `archived`
- `version`
- `schema_version`
- `message_count`
- `created_at`
- `updated_at`

It no longer downloads `snapshot_json`, `artifacts_json`, or `context_links_json` to render the session list.

The mapper retains a compatibility fallback: rows without `message_count` derive the count from `snapshot_json`, and rows without `schema_version` are interpreted as version 1. An unknown positive schema version is rejected explicitly so an older deployment cannot silently normalize and overwrite a future document shape.

## Change ledger

`session_changes` records one row per session version with:

- Session and owner identifiers.
- Optimistic session version.
- JSONB schema version.
- Change kind.
- Names of changed top-level fields.
- Materialized message count.
- Timestamp.

The ledger does not duplicate snapshots or message bodies. It is transactionally populated by a database trigger after inserts and versioned updates. Rows are removed when their parent session is deleted.

The table is server-only: RLS is enabled, `anon` and `authenticated` have no privileges, and only `service_role` can select or insert.

## Database verification

The production migration was verified transactionally with a temporary session:

- Insert version 1 generated `message_count = 2` and a `created` ledger entry.
- Updating the snapshot generated version 2, `message_count = 3`, and an `updated` entry listing only `snapshot` as changed.
- Repeating the update with stale expected version 1 returned zero rows and preserved version 2.
- An invalid version 1 snapshot shape was rejected by the check constraint.
- Deleting the temporary session removed its ledger rows through the foreign-key cascade.
- Final checks found no invalid schema versions, message-count mismatches, untracked current versions, or temporary verification rows.

## Future evolution sequence

1. Deploy readers that understand the next schema version.
2. Add a compatible database constraint branch for that version.
3. Begin writing the new version while preserving version 1 reads.
4. Backfill incrementally if required.
5. Extract stable entities such as messages or links into relational tables.
6. Keep `snapshot_json` as a materialized representation until all readers have migrated.
7. Remove the legacy shape only in a separate contract migration.

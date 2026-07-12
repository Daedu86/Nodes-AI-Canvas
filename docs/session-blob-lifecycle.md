# Session Blob Lifecycle

Nodes treats artifact objects as durable resources instead of deleting Storage files inline with session writes.

## Lifecycle

1. The upload route validates the file size, allowed MIME type, and basic file signature.
2. The object is uploaded to a content-addressed path under its session id.
3. A `pending` registry row records ownership, size, type, hash, and quota usage.
4. Saving the session activates every referenced object and atomically queues stale references for deletion.
5. Deleting a session queues all of its objects before the session row is removed.
6. The garbage collector deletes queued objects through the Supabase Storage API and then removes their registry rows.

Storage objects are never deleted by modifying `storage.objects` directly.

## States

- `pending`: uploaded but not yet referenced by a saved session.
- `active`: referenced by the current session document.
- `deleting`: queued for Storage API removal.
- `delete_failed`: the last removal attempt failed and will be retried with exponential backoff.

## Recovery

Pending uploads that remain unreferenced for one hour are treated as abandoned. Processing leases older than ten minutes are recovered. The collector scans Storage for unregistered, unreferenced objects and imports them into the deletion queue before removal.

## Limits

The bucket remains private and accepts only the MIME types supported by the upload validator. Individual artifacts remain capped at 8 MB, with images capped at 6 MB. Aggregate active and pending storage defaults to 100 MB per user and can be changed with `NODES_USER_STORAGE_QUOTA_BYTES`.

## Operations

Administrators can inspect the current metrics with `GET /api/admin/session-blobs` and execute cleanup with `POST /api/admin/session-blobs`.

The `session-blob-gc` Supabase Edge Function is intended for scheduled cleanup. It reconciles the bucket restrictions, scans for orphaned objects, processes up to 10,000 queued deletions per invocation, and records failures for retry.

# Session Versioning

Nodes uses optimistic concurrency control to prevent silent session overwrites.

## Contract

- Every persisted session has a positive integer `version`.
- New sessions start at version `1`.
- Every session mutation includes the version that the writer originally read as `expectedVersion`.
- A successful mutation increments the version by exactly one.
- A mutation only succeeds when the stored version still matches `expectedVersion`.

## Conflict response

The session API returns HTTP `409 Conflict` with code `session_version_conflict` and the current server document when another tab, device, collaborator, or agent has already saved a newer version.

The browser stops further automatic writes for that session and asks the user to choose:

- **Load latest**: accept the current server document.
- **Keep my changes**: explicitly retry the attempted patch against the latest version.

## Storage backends

Supabase enforces the comparison atomically in the `UPDATE` predicate. The local file backend serializes writes per session and performs the same version comparison before replacing the file.

## Agent writes

Agent chat persists the user prompt and assistant response as two separate versioned mutations. Each mutation uses the version returned by the previous successful write, so an external edit is detected rather than overwritten.

# Browser and artifact upload security

Phase 9 hardens both the browser execution boundary and the complete artifact upload path.

## Browser boundary

Every page response receives a per-request Content Security Policy nonce. Production pages allow scripts only from the application origin when they carry that nonce. The policy blocks plugins, frames, framing ancestors, cross-origin form submission, and insecure subresources.

Static headers add:

- HSTS in production.
- `X-Content-Type-Options: nosniff`.
- Frame denial and same-origin opener/resource isolation.
- A restrictive Permissions Policy.
- Strict-origin referrer handling.
- Disabled DNS prefetching and cross-domain policy files.
- Removal of the framework-identifying `X-Powered-By` header.

API routes retain their existing same-origin mutation checks. CSP applies to browser documents, while the static defensive headers apply to all routes.

## Request admission

The artifact endpoint validates request metadata before parsing multipart data:

1. The request must use `multipart/form-data` with a valid bounded boundary.
2. A valid `Content-Length` is mandatory.
3. The entire request must fit within the artifact limit plus a small multipart allowance.
4. The multipart form must contain exactly one field named `file`.
5. Authentication and session ownership are checked before storage writes.

This prevents a request from forcing unbounded multipart parsing before the application can reject it.

## Distributed upload governor

Production uses `artifact_upload_usage_state` and `reserve_artifact_upload_usage` to reserve per-user request and byte budgets under a PostgreSQL row lock. Local development and tests use the same semantics through an in-memory store.

Default budgets are:

- 12 requests and 48 MB per minute.
- 120 requests and 512 MB per hour.

They can be changed with:

- `NODES_UPLOAD_REQUESTS_PER_MINUTE`
- `NODES_UPLOAD_BYTES_PER_MINUTE`
- `NODES_UPLOAD_REQUESTS_PER_HOUR`
- `NODES_UPLOAD_BYTES_PER_HOUR`

Rejected requests return HTTP 429, `Retry-After`, and remaining-budget headers. All upload responses are marked `Cache-Control: no-store`.

## File validation

The server treats the extension as the canonical file type and verifies it against the declared MIME and actual bytes. File names are normalized and rejected when they contain path separators, control or bidirectional override characters, hidden/reserved names, or excessive length.

Content checks include:

- Image signatures and bounded dimensions/pixel counts.
- Complete UTF-8 validation for text, CSV, Markdown, and JSON.
- JSON syntax and nesting depth.
- PDF completion plus rejection of scripts, launch actions, forms, rich media, and embedded files.
- OOXML ZIP directory validation, safe paths, bounded entry count and expansion, compression-ratio limits, and required DOCX/XLSX/PPTX package entries.

The database registration function independently revalidates the private bucket, content-addressed blob reference, MIME allowlist, file name, extension, size, owner, and session.

## Storage boundary

The `session-artifacts` bucket remains private, capped at 8 MB per object, and restricted to the same MIME allowlist. It has no browser-facing Storage policies: uploads and downloads continue through authenticated application routes and the server-only service role. The service credential is never exposed to browser code.

## Production database verification

The migration `20260712193845_harden_browser_and_artifact_uploads` was exercised against the production Supabase project with temporary data:

- Two upload reservations were accepted and a third was rejected with the expected retry window.
- Minute and hourly usage windows reset correctly.
- A coherent private-bucket `.txt` registration succeeded.
- Mismatched extensions, invalid content-addressed references, and unavailable/public buckets were rejected.
- The usage table has RLS enabled and no `anon` or `authenticated` table privileges.
- The reservation function is executable only by `service_role`.
- The artifact bucket remains private with the 8 MB limit and exact MIME allowlist.
- No browser-facing Storage policy grants direct access to the bucket.
- All temporary sessions, blob metadata, queue entries, and quota rows were removed.

Supabase security and performance advisors reported no new phase-specific warning or error. Existing notices outside this phase remain unchanged.

## Release verification

A temporary GitHub-hosted diagnostic validated the complete phase state before release. The following gates passed:

- ESLint with zero warnings.
- Strict TypeScript checking.
- Targeted browser and upload security tests.
- Complete Vitest unit suite.
- Next.js production build.
- Chromium installation.
- Complete Playwright end-to-end suite with one worker.

Playwright verified the delivered nonce-bound CSP and defensive headers without bootstrap violations. It also confirmed rejection of a misleading `.html` upload and successful processing of one bounded `.txt` artifact. The temporary diagnostic workflow was deleted before this release commit.

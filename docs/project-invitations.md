# Project invitations and collaboration

Phase 10 replaces immediate email-based sharing with an explicit invitation lifecycle.

## Security model

Creating an invitation stores only a SHA-256 hash of a 256-bit URL-safe token. The plaintext token exists only in the returned invitation URL and is never persisted in PostgreSQL. Creating a replacement invitation for the same project and email revokes the previous pending token.

A pending invitation creates a visible pending member record but grants no project access. Acceptance requires:

- A valid, pending, unexpired token.
- An authenticated non-agent account.
- An account email matching the invited email after normalization.
- A single atomic database transaction that binds the membership to the authenticated `user_id` and consumes the invitation.

Future authorization uses the accepted `user_id`. Email matching remains only for accepted legacy memberships that predate this migration and have no user identifier.

## Roles

- **Owner**: manages invitations, accepted members, attached sessions, typed nodes, and project deletion.
- **Editor**: edits title, shared context, and Arena winner state.
- **Viewer**: read-only project access.

Pending users have no role until acceptance. Agent tokens cannot accept human collaboration invitations.

## Lifecycle

The owner can:

1. Create an invitation with viewer or editor role.
2. Copy the one-time link from the collaboration screen.
3. Reissue the invitation, invalidating the previous link.
4. Revoke a pending invitation.
5. Change roles or remove accepted members.

The recipient can preview a minimal project title, masked recipient email, role, and expiration without signing in. Acceptance or decline requires authentication. Tokens expire after seven days by default and may never exceed thirty days.

## Persistence

Supabase uses:

- `project_invitations` for token hashes and lifecycle state.
- `project_members.user_id` for stable accepted identity binding.
- `project_members.accepted_at` to distinguish active memberships from pending placeholders.
- `project_members.invitation_id` for lifecycle traceability.
- Service-role-only PostgreSQL functions for create, accept, decline, and revoke operations.

RLS is enabled and `anon`/`authenticated` receive no direct table or function privileges. Application routes use the server-side service role after NextAuth authorization.

The file backend implements the same lifecycle for local development and end-to-end tests, storing token hashes in owner-only local files.

## Routes

- `GET|POST /api/projects/:projectId/invitations`
- `DELETE /api/projects/:projectId/invitations/:invitationId`
- `GET /api/project-invitations/preview?token=...`
- `POST /api/project-invitations/accept`
- `POST /api/project-invitations/decline`
- `/invite/project/:token`
- `/projects/:projectId/collaboration`

All invitation responses use `Cache-Control: no-store`.

## Delivery

The application does not currently have a transactional email provider configured. Owners deliver invitation links by copying them from the collaboration screen. This avoids pretending an email was delivered when no mail transport exists and keeps the security lifecycle independent from a future email provider.

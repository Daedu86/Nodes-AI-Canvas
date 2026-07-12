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
2. Copy the one-time link from the collaboration screen or the existing Share control.
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

The application does not currently have a transactional email provider configured. Owners deliver invitation links by copying them from the collaboration screen or Share control. This avoids pretending an email was delivered when no mail transport exists and keeps the security lifecycle independent from a future email provider.

## Production database verification

The production migration was tested with temporary project, invitation, and membership rows:

- A pending invitation created a member placeholder with `user_id` and `accepted_at` both null.
- A different authenticated email was rejected without changing invitation state.
- The matching account accepted the invitation and bound the membership to its stable user identifier.
- Reusing the accepted token was rejected.
- Reissuing an invitation revoked the previous pending token and replaced the pending member role.
- Revoking the replacement token removed only the pending member and preserved accepted members.
- Deleting the temporary project removed invitations and memberships through cascades.
- Final checks found no temporary rows, no pending membership with an access identity, and no accepted identity without an acceptance timestamp.

The invitation table has RLS enabled. `anon`, `authenticated`, and `public` have no direct table or invitation-function access; only `service_role` can execute the lifecycle functions. Two follow-up migrations qualify PL/pgSQL references discovered by the transaction tests, ensuring a reproducible final function definition.

The migration history for this phase is:

- `20260712213323_project_invitations_and_membership_binding`
- `20260712215111_fix_project_invitation_acceptance_ambiguity`
- `20260712215156_fix_project_invitation_member_upsert`
- `20260712222320_index_project_member_invitations`

The final migration adds a covering index for `project_members.invitation_id`, clearing the new unindexed-foreign-key advisor notice. Remaining advisor notices are informational, pre-existing, or expected for newly created indexes that have not yet accumulated production usage.

## Release verification

A temporary GitHub-hosted diagnostic validated the complete final phase state. The following gates passed:

- ESLint with zero warnings.
- Strict TypeScript checking.
- Targeted token, invitation-lifecycle, and collaboration tests.
- Complete Vitest unit suite.
- Next.js production build.
- Chromium installation.
- Complete Playwright end-to-end suite with one worker.

Playwright verified that pending recipients cannot access a project, public previews mask the recipient email, a mismatched account cannot accept, the correct account receives its editor role and stable user binding, and an accepted token cannot be reused. The temporary diagnostic workflow was deleted before this release commit.

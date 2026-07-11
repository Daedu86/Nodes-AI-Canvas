# Deploying

Nodes deploys to Vercel with Supabase as the production persistence backend. Production builds validate their environment before Next.js starts compiling, so an unsafe or incomplete configuration fails closed instead of silently falling back to local files.

If you're deploying with Supabase, read: [cloud-persistence.md](cloud-persistence.md).

## OAuth callback URL (GitHub)

Set your GitHub OAuth callback URL to:

```text
https://your-deployed-url.vercel.app/api/auth/callback/github
```

## Production requirements

Set these in the Vercel **Production** environment:

- `AUTH_SECRET` with at least 32 random characters.
- `NEXTAUTH_URL` using the final HTTPS application origin.
- At least one complete OAuth pair: GitHub or Google.
- `NODES_PERSISTENCE_BACKEND=supabase`.
- `ALLOW_REMOTE_API=1`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Prefer a separate `LLM_SETTINGS_ENCRYPTION_KEY` so stored credentials can be rotated independently from Auth.js.

Agent-token issuance is disabled when `AGENT_TOKEN_SECRET` is absent. Browser login with an agent token is additionally disabled by default and requires `AUTH_ENABLE_AGENT_TOKEN_LOGIN=1`.

Production validation rejects local credentials, E2E authentication overrides, loopback URLs, partial OAuth pairs, contradictory OpenRouter key flags, placeholder or weak secrets, and reused auth/encryption/agent secrets.

## Environment Variables

Use `.env.example` as the local-development baseline and the production requirements above as the authoritative deployment checklist. Secrets belong in Vercel environment variables or local `.env.*.local` files, never in tracked environment files.

For public deployments, keep `OPENROUTER_REQUIRE_USER_KEY=1` and `OPENROUTER_ALLOW_DEPLOYMENT_KEY=0` unless you intentionally provide a shared deployment key.

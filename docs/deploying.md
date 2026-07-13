# Deploying

Nodes deploys to Vercel with Supabase as the production persistence backend. Production builds validate their environment before Next.js starts compiling, so an unsafe or incomplete configuration fails closed instead of silently falling back to local files.

<p>
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDaedu86%2FNodes-AI-Canvas&env=AUTH_SECRET,NEXTAUTH_URL,NODES_PERSISTENCE_BACKEND,ALLOW_REMOTE_API,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,LLM_SETTINGS_ENCRYPTION_KEY,AUTH_GITHUB_ID,AUTH_GITHUB_SECRET&envDescription=Production%20configuration%20required%20by%20Nodes&envLink=https%3A%2F%2Fgithub.com%2FDaedu86%2FNodes-AI-Canvas%2Fblob%2Fmain%2Fdocs%2Fdeploying.md">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>
</p>

The button creates the Vercel project, but it does not create Supabase or OAuth resources. Complete the preparation and verification steps below before treating a deployment as production-ready.

If you're deploying with Supabase, also read [cloud-persistence.md](cloud-persistence.md).

## Before deploying

Prepare these external resources:

- A Supabase project.
- The SQL objects defined in [`supabase/schema.sql`](../supabase/schema.sql).
- A private Supabase Storage bucket, normally `session-artifacts`.
- A GitHub or Google OAuth application.
- Independent high-entropy secrets for authentication and stored LLM credentials.

The repository can verify or create the Storage bucket after Supabase exists:

```bash
npm run setup:supabase-storage
```

## Production environment checklist

Set these in the Vercel **Production** environment.

### Required

| Variable | Production value |
| --- | --- |
| `AUTH_SECRET` | At least 32 random characters; never a placeholder. |
| `NEXTAUTH_URL` | Final HTTPS origin, without a trailing path. |
| `NODES_PERSISTENCE_BACKEND` | `supabase` |
| `ALLOW_REMOTE_API` | `1` |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key. |
| `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` | Complete GitHub OAuth pair, or use the Google pair below. |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` | Complete Google OAuth pair when GitHub is not configured. |

At least one complete OAuth pair is required. Do not configure only one half of a pair.

### Strongly recommended

| Variable | Purpose |
| --- | --- |
| `LLM_SETTINGS_ENCRYPTION_KEY` | Encrypt stored per-user provider credentials independently from Auth.js. |
| `SUPABASE_SESSION_ARTIFACTS_BUCKET` | Explicit private bucket name; defaults to `session-artifacts`. |
| `OPENROUTER_REQUIRE_USER_KEY` | Keep `1` for public deployments. |
| `OPENROUTER_ALLOW_DEPLOYMENT_KEY` | Keep `0` unless the deployment owner intentionally funds shared usage. |
| `NODES_DEFAULT_USER_PLAN` | Explicitly select `free` or `paid` defaults. |
| `NODES_ADMIN_EMAILS` or `NODES_ADMIN_USER_IDS` | Restrict built-in administration screens. |

### Keep disabled in production

```env
AUTH_ENABLE_DEV_CREDENTIALS=0
ALLOW_E2E_AUTH_OVERRIDE=0
AUTH_ENABLE_AGENT_TOKEN_LOGIN=0
```

Agent-token issuance is disabled when `AGENT_TOKEN_SECRET` is absent. Browser login with an agent token is additionally disabled by default and should remain disabled unless that workflow is intentionally designed and reviewed.

Production validation rejects local credentials, E2E authentication overrides, loopback URLs, partial OAuth pairs, contradictory OpenRouter key flags, placeholder or weak secrets, and reused auth, encryption, or agent secrets.

## OAuth callback URLs

### GitHub

```text
https://your-deployed-url.vercel.app/api/auth/callback/github
```

### Google

```text
https://your-deployed-url.vercel.app/api/auth/callback/google
```

Replace the placeholder origin with the final production domain and update `NEXTAUTH_URL` to the same origin.

## After deploying

Verify the production deployment in this order:

- [ ] The deployment build completes without environment validation errors.
- [ ] The sign-in screen exposes only the OAuth providers you configured.
- [ ] A new account can sign in and create a session.
- [ ] A session survives a page reload and a new deployment.
- [ ] A project can attach sessions and memory.
- [ ] Artifact uploads use the private Supabase bucket.
- [ ] One user cannot read another user's sessions, projects, memory, settings, or invitations.
- [ ] An invitation can be accepted only by the intended email address.
- [ ] Runtime logs do not contain API keys, tokens, or private project content.
- [ ] Speed Insights and Vercel function errors are visible in the project dashboard.

## Public demo deployments

A public product demo should not expose a shared unrestricted OpenRouter key. Prefer one of these models:

1. Users sign in and provide their own OpenRouter key.
2. The demo account is read-only and uses preloaded data.
3. Shared inference is protected by strict quotas and a deliberately small spending limit.

The deterministic local demo in [`product-demo.md`](product-demo.md) is the safest presentation option because it shows branching, Canvas, Arena, and project memory without waiting for or paying for model output.

## Environment variables

Use `.env.example` as the local-development baseline and this production checklist as the authoritative deployment reference. Secrets belong in Vercel environment variables or local `.env.*.local` files, never in tracked environment files.

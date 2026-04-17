# Deploying

Nodes deploys cleanly to Vercel. For production persistence, this project supports a cloud backend (sessions/projects/memory in a database and blobs in object storage).

If you're deploying with Supabase, read: [cloud-persistence.md](cloud-persistence.md).

## OAuth callback URL (GitHub)

Set your GitHub OAuth callback URL to:

```text
https://your-deployed-url.vercel.app/api/auth/callback/github
```

## Environment Variables

Use `.env.example` as the reference for the full list.

Notes:

- For public deployments, prefer requiring user-provided keys for hosted providers.
- The app supports per-user provider keys via **Profile → LLM Models** (server-stored; masked in the UI).


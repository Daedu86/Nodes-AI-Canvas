# Security Policy

Security is a core requirement for Nodes because the application handles authentication, user-provided provider credentials, AI requests, project collaboration, and uploaded artifacts.

## Supported Versions

Nodes is under active development. Security fixes are applied to the current `main` branch. Older commits, forks, and independently deployed versions may not receive backported fixes.

## Reporting a Vulnerability

Do not open a public issue, discussion, or pull request for a suspected vulnerability.

Report vulnerabilities privately through GitHub:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Choose **Report a vulnerability** to create a private security advisory.

Include as much of the following information as possible:

- affected feature, route, or file;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- potential impact;
- deployment assumptions required for exploitation;
- suggested mitigation, when known.

Avoid including real API keys, authentication secrets, personal data, or credentials in the report. Replace sensitive values with clearly marked placeholders.

## Coordinated Disclosure

Please allow the maintainer time to validate the report, prepare a fix, and determine whether users need migration or deployment instructions before publishing technical details.

After validation, the repository may use a private security advisory to coordinate a patch and publish an advisory when the fix is available.

## Security Boundaries

When evaluating or deploying Nodes, keep these boundaries in mind:

- Production requires authenticated users and server-side ownership enforcement.
- Supabase service-role credentials must remain server-side.
- Per-user LLM credentials should use a dedicated encryption key in production.
- Development credentials and E2E authentication overrides must remain disabled in production.
- Artifact uploads are validated and rate-limited, but deployments must still configure storage and request limits appropriate to their environment.
- Ollama remote hosts should remain disabled unless the deployment uses an explicit trusted-host policy.

See [docs/deploying.md](docs/deploying.md), [docs/cloud-persistence.md](docs/cloud-persistence.md), and [.env.example](.env.example) for the current operational requirements.

## Non-security Support

Use regular GitHub issues for reproducible bugs, feature requests, documentation problems, and other reports that do not expose a security weakness.

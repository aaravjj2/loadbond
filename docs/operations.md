# Local operations and deployment handoff

## Local data

Stop the backend before a simple file-copy backup, or use SQLite's backup API. Copy both SQLite databases (`workbench.sqlite` and any legacy `loadbond.sqlite`) and `data/objects`. Restore into a new directory and set LOADBOND_DATA to it. Verify hashes, audit linkage and a historical run before using the copy. Never overwrite the only available backup.

## Hosting

The current app is loopback-only. It is not publicly deployed. A demo deployment needs a Node runtime for Next.js and a Python runtime for FastAPI, with a persistent volume for the SQLite database and original objects. Use one backend instance while SQLite is authoritative. Set LOADBOND_API_URL in the frontend server, replace default workspace tokens, use HTTPS, and restrict synthetic/demo input. Do not publish the default local-demo credential as customer authentication.

Managed PostgreSQL, object storage, secrets management, OIDC/MFA, role separation, rate limits, malware scanning and provider data controls are production prerequisites rather than completed features. No paid infrastructure has been activated.

## Release gate

Require passing solver regression tests, type/build checks, workspace isolation checks, snapshot reproduction and manual UI walkthrough. Block on a missing material audit event, unverified dependency credit, failed source validation or a critical/high issue without disposition. Any model/prompt/schema change must rerun the extraction evaluations before use.

## Incident response for this demo

Stop the local services, preserve logs without contract bodies, record affected workspace and run IDs, revoke a compromised token in configuration, and restore only from a verified backup. Do not claim production incident readiness based on this local runbook.

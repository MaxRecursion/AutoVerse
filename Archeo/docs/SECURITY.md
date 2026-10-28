# Security and privacy

- Only public GitHub repositories are supported. Repository identity is parsed and validated; callers cannot supply URLs or hosts for server-side fetches.
- GitHub requests use the fixed API origin, validated owner/repository/branch/blob identifiers, an 8-second timeout, at most one retry for transient transport or 5xx failures, bounded response bodies, concurrency, byte/file/node/evidence budgets, and a bounded analysis response (no retry for rate limits).
- A branch is resolved once. All source reads in one analysis use the resolved commit tree/blob SHA. Source requests verify the path and blob SHA belong to the supplied commit before returning one text file up to 96 KiB.
- Repository source and manifests are untrusted data. The application does not execute repository code, install packages, follow repository URLs, or log source contents/tokens.
- Analysis is held only in browser memory. Reloading or using Clear removes it. No database, account, tracking store, or mandatory secret is configured.
- Anonymous GitHub REST quotas apply. The UI surfaces rate limits and suggests waiting. No process-local limiter is presented as a distributed abuse control.
- The centralized budgets cap analysis at 2,500 eligible tree entries, 180 parsed source files, 80 KiB per file, 1 MiB total source/config text, eight blob requests at once, 500 graph nodes, 1,200 edges, 2,000 evidence items, a 3.6 MB response, and 25 seconds of analysis time.
- Vercel function duration, plan, region, and payload limits can change. This app sets a small internal deadline and a 30-second shared-function cap. Check current account and platform settings before changing the cap; the project needs no paid service or database.

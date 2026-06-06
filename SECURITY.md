# Security Policy

## Reporting a Vulnerability

Please do not include sensitive details in a public issue.

Preferred reporting path:

1. Use GitHub private vulnerability reporting for this repository if it is available.
2. If private reporting is not available, open a minimal public issue that states you have a security report and ask for a maintainer contact path.

Include enough information for maintainers to reproduce and assess the issue:

- Affected version or commit
- Affected package or feature
- Impact
- Reproduction steps or proof of concept
- Whether the issue is already public

## Scope

Security reports may include issues in:

- Local dashboard authentication or `AIUSAGE_DASHBOARD_PASSWORD`
- Local API endpoints
- Leaderboard upload signing or device authorization
- Sync backends
- Website account, OAuth, upload review, or admin flows
- Dependency or packaging risks

## Data Handling

aiusage is local-first. Local parsing and the local dashboard do not require an account and do not send telemetry. Optional sync and leaderboard features may send user-selected aggregate or sync data depending on configuration.

Leaderboard uploads are intended to contain aggregate usage totals only, not prompts, completions, source code, or local file paths.

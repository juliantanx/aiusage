# Local dashboard security

`aiusage serve` binds to `127.0.0.1:3847`. `--host ::1` selects IPv6 loopback;
`--host localhost` selects `127.0.0.1` without DNS resolution. Port fallback
keeps the selected host, and the startup message reports the actual bind address.

Other bind addresses, including `0.0.0.0`, `::`, LAN addresses, and hostnames,
require a non-empty `AIUSAGE_DASHBOARD_PASSWORD`. Set it before starting the
process. The Docker command explicitly binds to `0.0.0.0`, so containers also
require this variable; the documented `docker run` examples pass it with `-e`.
For access over a network, terminate HTTPS at a trusted reverse proxy. The proxy
must preserve the browser-facing Host header and replace any incoming
`X-Forwarded-Proto` header with the browser-facing scheme. HTTPS login and logout
responses then set the dashboard cookie with `Secure`; direct localhost HTTP keeps
a non-`Secure` cookie for local development. Do not expose a passwordless loopback
service through a proxy or tunnel; configure the password for that use.

With a password enabled, all detailed API routes require the dashboard login
cookie, including quotas, credential status, configuration, session details,
imports, sync, the cloud sync availability proxy, and the detailed `/api/summary`
breakdown (per-tool totals, top tool calls, MCP servers, and device/tool filters).
Only `/api/home-summary` remains deliberately public, as do the static dashboard
shell and authentication routes. It accepts only `range` and returns the aggregate
totals shown on the home page (tokens, cost, sessions, active days) across all
devices and tools, with no breakdowns or filtering.
Quota warnings are available after authentication. A filename-like session ID
does not bypass API authentication.
Quota errors omit raw credential JSON, exception details, and upstream error
bodies so failures cannot echo credentials into the dashboard.

Browser API requests must be same-origin. No wildcard CORS headers are sent.
Requests with a foreign or opaque (`null`) Origin, or cross-site Fetch Metadata,
are rejected before handlers run, including login and mutating endpoints.
When `X-Forwarded-Proto` is present, it must be exactly `http` or `https` and must
agree with the Origin scheme. Forwarded Host headers are not trusted; the proxy
must preserve the browser-facing `Host` value.
Native clients may omit Origin. Without a password, the API additionally rejects
non-loopback Host names to prevent DNS rebinding. The Vite development proxy
preserves Host and Origin and forwards `/api` to `127.0.0.1:3847`.

## Credential settings API

Stored credential values are write-only through HTTP. `GET /api/config/credential`
has been removed and returns 404 (401 before login when authentication is enabled).
`GET /api/config` no longer includes `credentialKeys` or `sync.credentialRef`.
Instead, `credentialStatus` contains boolean fields for the active sync target:
`githubApp` and `githubToken`, or `s3AccessKeyId` and `s3SecretAccessKey`.

To check another target, use
`GET /api/config/credentials/status?backend=github&repo=owner%2Frepo` or
`GET /api/config/credentials/status?backend=s3&bucket=my-bucket`.
These return only the corresponding boolean fields, never storage references.

Set or replace credentials with `PUT /api/config`:

GitHub setup now prefers **Connect GitHub**, which uses the local device-flow
API. New App credentials and PAT replacements use secure storage outside
`config.json`; existing PAT configs remain compatible. See
[GitHub sync authentication](github-sync.md) for setup and migration.

```json
{
  "sync": { "backend": "github", "repo": "owner/repo" },
  "syncCredentials": { "githubToken": "new-token" }
}
```

For S3, use `s3AccessKeyId` and `s3SecretAccessKey`. Empty or omitted fields retain
the saved values. Responses contain only `{ "ok": true }`. The settings form
starts with blank secret inputs, clears replacements after saving, and only
allows showing values just entered by the user. Existing storage keys and the
legacy `credentials` write payload remain supported; legacy PATs are
unchanged. The UI no longer infers a sync target by enumerating stored keys.

## Compatibility

- LAN deployments must opt in with `--host` and configure a password; Docker
  deployments must configure the password.
- Cross-origin browser API clients must move behind a same-origin proxy.
- Consumers of credential reads/references must migrate to the configured-state
  and replacement APIs above.
- Password-protected quota, cloud sync availability, and `/api/summary` clients
  must log in; the home page uses the public `/api/home-summary` totals instead.
- `/api/refresh` requires POST; GET returns 405 and does not parse logs.

Request-body size limits are outside this change.

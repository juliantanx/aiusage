# Cloud Sync Star-Gating Design

## Overview

Gate AIUsage Cloud Sync behind GitHub star verification. Users must star `juliantanx/aiusage` to use Cloud Sync for free. Admins can manually override (grant or revoke) access. Non-GitHub users must bind a GitHub account first.

## Database Changes

### `user_identities` table — add column

```sql
ALTER TABLE user_identities ADD COLUMN access_token TEXT;
```

Stores the GitHub OAuth access token (encrypted at rest via existing credential encryption pattern). Used to call GitHub API for star verification. Updated on every GitHub OAuth login or bind.

### `users` table — add columns

```sql
ALTER TABLE users ADD COLUMN cloud_sync_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN github_starred BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN github_star_checked_at TIMESTAMPTZ;
```

- `cloud_sync_enabled`: Admin manual override. When `true`, user can use Cloud Sync regardless of star status.
- `github_starred`: Cached result of last star check.
- `github_star_checked_at`: Timestamp of last check. Cache TTL is configurable (default 24h).

## Star Verification Flow

### Trigger Point

Cloud Sync push (`POST /api/cli/sync/push`) and pull (`GET /api/cli/sync/pull`) endpoints.

### Decision Logic

```
Request arrives at push/pull
  -> Verify HMAC signature -> get device -> get user_id
  -> Check users.cloud_sync_enabled
     -> true: ALLOW (admin override, skip star check)
     -> false: continue
  -> Check user_identities for provider='github'
     -> not found: DENY with error GITHUB_BINDING_REQUIRED
     -> found: continue
  -> Check github_star_checked_at
     -> within TTL: use cached github_starred value
     -> expired or null: call GitHub API
  -> GitHub API: GET /user/starred/juliantanx/aiusage
     -> 204: starred=true, update cache, ALLOW
     -> 404: starred=false, update cache, DENY with error STAR_REQUIRED
     -> API error: use cached value if available, else DENY
```

### Error Responses

```json
// Not starred
{ "error": { "code": "STAR_REQUIRED", "message": "Please star the repository to use Cloud Sync.", "repo": "juliantanx/aiusage", "url": "https://github.com/juliantanx/aiusage" } }

// No GitHub account bound
{ "error": { "code": "GITHUB_BINDING_REQUIRED", "message": "Please bind your GitHub account to use Cloud Sync.", "url": "https://aiusage.jtanx.com/settings" } }
```

HTTP status: 403 for both.

## GitHub Token Persistence

### Where

`user_identities.access_token` column for rows where `provider = 'github'`.

### When Updated

1. **GitHub OAuth login** (`/api/oauth/github/callback`): After exchanging code for token, store token in identity record (insert or update).
2. **GitHub bind** (same callback, logged-in user path): Store token when binding.

### Token Scope

Current OAuth scope is `user:email`. Star check (`GET /user/starred/{owner}/{repo}`) works with any authenticated token — no additional scope needed.

## GitHub Binding (Non-GitHub Users)

### Site Settings Page (`/settings`)

Add a "Linked Accounts" section:

- List all entries from `user_identities` for the current user
- For each identity: show provider icon + username
- If GitHub not linked: show "Bind GitHub" button -> redirects to `/api/oauth/github/start`
- If GitHub linked: show GitHub username (read-only)

### Conflict Handling

Already implemented in `bindOAuthIdentity()`:
- If the GitHub account (`provider_user_id`) is already linked to another user -> return error "This account is already linked to another user"
- If already bound to the same user -> no-op, return success

### Reverse Flow Safety

When a user who registered via password later binds GitHub, their `user_identities` gets a github record. If they then try to log in via GitHub OAuth (not logged in), `findOrCreateOAuthUser()` finds the existing identity and returns the correct user. No conflict.

## CLI Dashboard UI Changes (`packages/web`)

### Cloud Backend Description

Replace the current short description with an enhanced version highlighting advantages:

**English:**
> "Zero-config cloud sync — encrypted, fast, and automatic. Just log in and go. Requires starring the GitHub repository for free access."

**Chinese:**
> "零配置云同步 — 加密传输、极速同步、自动化。登录即用。Star GitHub 仓库即可免费使用。"

### Star Prompt

When Cloud backend is selected, show a prominent link below the description:

```
Star the repo to unlock Cloud Sync: https://github.com/juliantanx/aiusage
```

With a clickable link (opens in new tab).

### Cloud Sync Error Display

Handle new error codes from sync endpoints:

| Error Code | Display (EN) | Display (ZH) |
|------------|-------------|-------------|
| `STAR_REQUIRED` | "Please star the project to use Cloud Sync" + repo link | "请 Star 项目后重试" + 仓库链接 |
| `GITHUB_BINDING_REQUIRED` | "Please bind your GitHub account at aiusage.jtanx.com/settings" | "请先在 aiusage.jtanx.com/settings 绑定 GitHub 账号" |

These are displayed in the sync status error area, same as other sync errors.

## Admin Panel Changes (`packages/site`)

### Users Tab

Add columns to user list:

| Column | Content |
|--------|---------|
| GitHub | Username from `user_identities` where provider='github', or "—" |
| Star | Cached `github_starred` value: checkmark or cross |
| Cloud Sync | Toggle switch for `cloud_sync_enabled` (admin override) |

Toggle calls `POST /api/admin/users/{id}/cloud-sync` with `{ enabled: boolean }`.

### Config Tab

Add new config entries to the "Data Sync" category:

| Key | Default | Description |
|-----|---------|-------------|
| `cloud.star_cache_ttl_hours` | 24 | How long to cache star check results (hours) |
| `cloud.star_repo` | `juliantanx/aiusage` | GitHub repository that must be starred |

## New API Endpoints

### `POST /api/admin/users/{id}/cloud-sync`

Admin-only. Set `cloud_sync_enabled` for a user.

Request: `{ "enabled": true }`
Response: `{ "ok": true }`

Logs to `admin_audit_logs` with action `set_cloud_sync`.

### `GET /api/me/identities`

Returns list of linked OAuth identities for the current user.

Response:
```json
{
  "identities": [
    { "provider": "github", "username": "octocat", "email": "octocat@github.com", "created_at": "..." },
    { "provider": "linux_do", "username": "user123", "email": "...", "created_at": "..." }
  ]
}
```

Does NOT return `access_token`.

## Files to Modify

### Site (`packages/site`)

| File | Change |
|------|--------|
| `src/lib/server/db/schema.ts` | Add migration for new columns |
| `src/lib/server/config.ts` | Add `cloud.star_cache_ttl_hours`, `cloud.star_repo` |
| `src/lib/server/oauth/providers.ts` | Store `access_token` in `bindOAuthIdentity` and `findOrCreateOAuthUser` |
| `src/routes/api/oauth/github/callback/+server.ts` | Pass token to provider functions |
| `src/routes/api/oauth/linux-do/callback/+server.ts` | No change needed |
| `src/routes/api/cli/sync/push/+server.ts` | Add star gate check before processing |
| `src/routes/api/cli/sync/pull/+server.ts` | Add star gate check before processing |
| `src/routes/api/me/identities/+server.ts` | New endpoint |
| `src/routes/api/admin/users/[id]/cloud-sync/+server.ts` | New endpoint |
| `src/routes/api/admin/users/+server.ts` | Return GitHub username, star status, cloud_sync_enabled |
| `src/routes/settings/+page.svelte` | Add "Linked Accounts" section |
| `src/routes/admin/+page.svelte` | Add GitHub/Star/CloudSync columns to user list |

### New File

| File | Purpose |
|------|---------|
| `src/lib/server/cloud/star-check.ts` | `checkGitHubStar(userId)` — encapsulates star verification with caching |

### CLI Dashboard (`packages/web`)

| File | Change |
|------|--------|
| `src/routes/settings/+page.svelte` | Enhanced Cloud description, star prompt link |
| `src/lib/i18n.js` | New translation keys for Cloud advantages, star prompt, error messages |

## Security Considerations

- GitHub access tokens stored encrypted (follow existing credential storage pattern)
- `GET /api/me/identities` never returns `access_token`
- Admin cloud_sync toggle logged in audit trail
- Star check uses user's own token — no shared service token
- GitHub API rate limit: 5000 req/hour per token; with 24h cache, worst case is 1 check per user per day

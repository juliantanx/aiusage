# GitHub sync authentication

AIUsage connects directly to GitHub using a **GitHub App**, with user access
tokens obtained through GitHub's device authorization flow. Neither an AIUsage
account nor the hosted service is involved. The website's separate OAuth App
login keeps its `user:email` scope; it cannot authorize repository sync.

## Connect from the CLI or dashboard

Create a private sync repository on GitHub and initialize it with a README.
Use a dedicated repository because sync writes usage data and remote cleanup
can delete that data. Configure the App registration described below, then run:

```sh
aiusage github login --repo OWNER/aiusage-data
# Or:
aiusage init --backend github --repo OWNER/aiusage-data
aiusage sync
```

The CLI displays GitHub's verification URL and public user code. Open the URL
on any device and enter the code. The CLI detects your GitHub account, displays
the App installation link, and waits for access to the requested repository.
Choose **Only select repositories** during installation and select only the
sync repository. Organization administrators may need to approve installation.
The CLI waits up to ten minutes for repository access after authorization.
Without `--repo`, an interactive terminal lists available repositories and lets
you refresh the list after installation. Headless users should pass `--repo`.

In the local dashboard, choose **Settings → GitHub → Connect GitHub**, follow
the verification link, then install/configure the App, refresh repositories, and
select the sync repository. Selection saves the connection and records sync
consent. Use the regular settings save button for the automatic-sync interval.
The App's user token can access only repositories accessible to both the App
installation and the signed-in user. The sync backend only supplies credentials
for the selected repository. GitHub does not offer repository restriction in
the device token exchange, so installation on only the sync repository matters.

## Maintainer: register the GitHub App

In GitHub **Settings → Developer settings → GitHub Apps**, create an App
(not a conventional OAuth App). Set:

| Setting | Value |
| --- | --- |
| Repository Contents | **Read and write** |
| Repository Metadata | **Read-only**, automatically required by GitHub |
| Other repository, organization, account permissions | None |
| Device flow | **Enable Device Flow** |
| User-to-server token expiration | Enabled (default); do not opt out |
| Webhooks | Inactive; this local client does not receive webhooks |
| Request user authorization during installation | Off; authorization uses device flow |
| Callback URL / setup URL | Not used; leave unset where GitHub permits |
| Installation availability | Any account if distributing to other users |

No client secret, App private key, callback server, or token broker is needed.
If the registration UI requires a callback URL, use a maintainer-controlled
HTTPS information page; the client never sends a browser authorization request
or consumes that callback. Do not point it at the hosted OAuth login callback.
No callback `state` is needed because this implementation has no callback flow.
Local dashboard requests still use its authentication and same-origin/Host
checks, and a random, expiring, one-use connection session capability.

Set these **public, non-secret** values in the environment running the CLI and
the dashboard server (including service managers/containers):

```sh
export AIUSAGE_GITHUB_APP_CLIENT_ID=Iv1.YOUR_GITHUB_APP_CLIENT_ID
export AIUSAGE_GITHUB_APP_SLUG=your-aiusage-sync-app
```

The client ID comes from the GitHub App settings, not the numeric App ID.
This repository does not ship an invented/default App registration: maintainers
must create one and distribute these two values, or users may register their
own App. Once connected, refresh uses the saved public client ID, so these
environment variables are only needed when connecting again. No
`GITHUB_CLIENT_SECRET` or hosted-service OAuth settings need to change.

GitHub documents the [App device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
and [refresh without a client secret for device-issued tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).

## Storage, refresh, and Git transport

New App credentials and manually saved PATs go into the OS keychain through
`@napi-rs/keyring` (macOS Keychain, Windows Credential Manager, Linux Secret
Service where available). `config.json` stores an explicit `githubAuth.method`
(`github-app` or `pat`) and an opaque credential reference, plus public account,
installation, client ID, repository, and default branch metadata.

When a POSIX keychain is unavailable, new credentials fall back to individual
files under `~/.aiusage/github-credentials/` (directory `0700`, files `0600`,
atomic replacement). Existing keychain records never silently downgrade to
files. Windows fails closed if Credential Manager is unavailable, because POSIX
file modes do not establish Windows ACL protection. Use an environment PAT in
that case. A locked keychain produces a sanitized error; unlock it and retry.

Tokens refresh automatically sixty seconds before expiry. Refresh rotates both
tokens, persists the new pair, and uses the existing process lock abstraction
to serialize dashboard/CLI refreshes. An expired/revoked refresh token requires
`aiusage github login` again. If storage fails after GitHub rotates the pair,
reconnect after fixing storage. Authorization denial, expiration, pending, and
cumulative five-second slow-down responses are handled explicitly.

Git remote URLs are always `https://github.com/OWNER/REPO.git`. A temporary
credential helper receives the token through the child process environment and
returns it only through Git's private credential pipe, for the exact HTTPS host
and repository. It ignores Git's store/erase requests, disables other helpers,
redirects, inherited Git tracing/config injection, and hooks for sync operations.
Local Git commands receive no sync token. No helper or credential is saved to
Git configuration. Existing authenticated URLs in the sync cache are scrubbed
before the next Git operation. Child-process and remote error payloads are
discarded instead of exposing potentially secret-bearing diagnostics.

## Advanced PAT fallback and migration

Existing `credentials["github/OWNER/REPO/token"]` configurations continue working
without reauthentication. A missing authentication method means legacy PAT.
The next explicit PAT replacement moves that repository's PAT to secure
storage and removes its old config entry. App login replaces the active sync
authentication; unrelated legacy credential entries remain for compatibility.

For CI, headless environments without a keychain, or manual operation, create a
**fine-grained PAT** limited to your sync repository, with Contents read/write
and automatic Metadata read access. Supply it via your secret manager:

```sh
# AIUSAGE_GITHUB_TOKEN is supplied securely by the environment/CI secret store.
aiusage init --backend github --repo OWNER/aiusage-data
aiusage sync
```

Running `init` with that environment variable selects PAT mode. The variable is
read only in PAT mode; it never overrides an existing App connection during
ordinary sync. The dashboard's **Advanced: manual PAT / automation** disclosure
accepts a write-only replacement. The legacy `init --token` option still works,
but environment injection avoids placing a token in shell history or the CLI
process command line. Empty settings fields preserve existing credentials.

Dashboard settings/status responses never return stored PATs, access/refresh
tokens, device codes, or credential-store references. The public user code is
shown only while connecting. To revoke access, remove the App authorization or
installation in GitHub settings; local sync then requires a new connection.

## Verification

Tests cover device success/pending/slow-down/denial/expiry, refresh and locking,
PAT compatibility and replacement, keychain/fallback behavior, repository
selection, session capabilities, API authentication/origin checks, secret-free
responses/errors, cached URL migration, and real Git credential-helper piping.
The POSIX file-mode assertion runs on POSIX and is skipped on Windows; the
Windows fail-closed branch is tested on every platform. Live authorization
requires a maintainer-created App and a test GitHub account/repository.

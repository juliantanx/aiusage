# Repairing cross-device sync contamination

Versions up to 1.5.13 could copy records pulled from one device into another
device's sync namespace, and versions up to 1.5.16 never removed a record from
a namespace once it had been uploaded. This document explains how to tell
legitimate records from copies and leftovers, and how to clean up existing
data with `aiusage sync --repair`. The current sync model is described in
[`sync-namespaces.md`](./sync-namespaces.md).

## What went wrong

Every device uploads its records under its own namespace,
`data/<deviceInstanceId>/YYYY/MM/DD.ndjson`, and pulls every other namespace.
Pulled records are stored in `synced_records` and then *merged* into `records`
so local queries can see them.

The merged rows used to be recognised only by a placeholder
`source_file = 'synced/<device>'`. When the wire format started carrying the
real `source_file` and `cwd` (needed for cross-device project statistics),
merged rows looked exactly like locally parsed rows. The pulling device then:

1. selected them as "unsynced local records",
2. uploaded them under **its own** namespace, and
3. because merged rows have `line_offset = 0`, gave every record from one
   source file the **same** sync id `sha256(originDevice, sourceFile, 0)`.

Each such upload is an *echo*: a collapsed copy of another device's usage,
carrying the original `deviceInstanceId` but living in the wrong directory.
Echoes were pulled back by the origin device, merged, and re-uploaded again,
so a record could exist in several namespaces under several ids and be counted
more than once on every machine.

## What the fix does

* `records` gained an explicit `origin` column (`local` or `synced`). Only
  `origin = 'local'` rows stamped with the current device id (or the pre-init
  `unknown` sentinel) are ever uploaded, and only under that device's
  namespace. `source_file` is no longer used to decide provenance anywhere.
* Pull ignores any line whose `deviceInstanceId` is a concrete id different
  from the namespace it was read from, and any line carrying the pulling
  device's own id. Such lines can only be echoes; their authoritative copy is
  in the origin device's namespace.
* Merged rows keep their wire id and keep `source_file` and `cwd`.
* Migration v13 back-fills `origin` for existing databases (see below).
* The cloud backend applies the same rules (own-device records returned by the
  server are skipped, pulled rows are never pushed).

## Telling legitimate records from copies

Every rule is deterministic; none of them looks at `source_file`.

| Where | Rule | Why it is safe |
| --- | --- | --- |
| Local `records` | A row whose `session_id` equals the `session_key` of the `synced_records` row with the same id was written by the merge step. | The merge step is the only writer that stores the 24-hex session-key hash in `session_id`. A parser stores the tool's real session id, which cannot equal `sha256(device + sessionId)[0:24]` of another session (hash pre-image). |
| Local `records` | A `local` row stamped with a *different, concrete* device id was not parsed here. | Parsers always stamp the current device id, or `unknown` before `aiusage init`. |
| Remote namespace | A line whose `deviceInstanceId` is a concrete id different from the namespace owner. | Only the owning device writes to its namespace, and after the fix it writes only its own records. |
| Remote or local | A line/row E is an *echo* when a session key K known anywhere in the system (any namespace, any local row) exists such that `sha256(E.device + "\0" + K)[0:24] === E.sessionKey`. | Re-uploading a merged row hashes its already-hashed session key. A genuine session key is the hash of a tool-generated session id, never of another session's 24-hex key. Usage fields are not compared because backfills may rewrite model, cost or timestamps on the origin device after the echo was taken. |
| Local `synced_records` | A row stamped with this device's own id. | Pull never reads our own namespace, so our id can only appear there by bouncing through another device. The authoritative row is in `records`. |
| **This device's** namespace | A *stale* line: its id is not produced by any record in the local database. | The namespace is a snapshot of this device's database (see [`sync-namespaces.md`](./sync-namespaces.md)). The record was deleted, the cache was rebuilt with different ids, or the record now travels under a different id (Antigravity/Trae, from the release following 1.5.17). Only the owning device can judge this, so other namespaces are never checked for staleness. |
| Any namespace | A *duplicate* line: the same id appears more than once in one namespace (usually across day files after a record's timestamp changed). | Only the copy with the highest `updatedAt` is kept. The choice is made among the copies no other rule removes: a foreign-device, echo or stale copy is dropped (and counted) under its own rule and never counts as the newest, so a contaminated copy with a later `updatedAt` cannot take the legitimate line with it. |
| Local `records` | A *wire-id collision*: two local records that map to the same sync id. | Reported, never deleted. The mapper is expected to make this impossible; a non-zero count is a bug worth reporting with the tool names involved. Until fixed, only the most recently updated record of each group is uploaded. |
| Local `synced_records` | An *orphaned* pulled row: an *unresolved* row (no sync target claims it — pulled before per-target claims existed, read from a namespace that could not be verified since, or released by its last claimant while another known target had not judged its namespace yet) that the configured target provably does not carry: its device has no namespace there (no day files and no manifest), or the device's namespace verified and does not contain the row. Rows of a namespace that could not be verified are never reported. | Sync settles unresolved rows by itself once every target recorded in `state.json` has judged their namespace; only a target that is never synced again withholds that verdict, and repair is the deterministic way out. If the device does publish the row on another target, sync that target first and it stops being reported. Every row `--apply` removes (echo or orphan) takes its `sync_record_claims` entries with it, so no claim ever outlives its row. |

Lines with `deviceInstanceId = 'unknown'` are records parsed before
`aiusage init` created `state.json`. On pull they are attributed to the
namespace owner; in this device's own namespace they are stale unless the
local database still holds the record (in which case the next sync republishes
it under the real device id anyway).

Removing an echo never loses usage: by construction the parent it was derived
from still exists (the origin device's own row or its own namespace line).
Removing a stale line never loses usage either: the local database is the
source of truth for this device and a normal `aiusage sync` drops it as well.

## Stale records left by 1.5.16 and earlier

Upload used to *merge* into the remote day files and never removed anything,
and pull never removed rows that had disappeared from a peer's namespace. So
after rebuilding a local cache, correcting records, or changing how ids are
derived, the old ids stayed in the namespace and on every peer, and totals
diverged between machines. In addition, Antigravity records were published
under `sha256(device, sourceFile, lineOffset)`; several usage events of one
generation share that key, so on one machine 972 local records became 929
remote ones. The same applied to Trae sessions (all at offset 0).

From the release following 1.5.17 both are fixed structurally: every sync
rewrites the device's namespace as a snapshot of its database (with a manifest
peers verify before trusting it) and prunes peer rows that vanished remotely
once no sync target claims them, and Antigravity/Trae publish under their
parser-generated ids. The first sync after upgrading cleans up automatically on
every device that runs it; `--repair` is only needed to inspect the state
before that, to clean namespaces of devices that will never sync again, or to
remove unresolved rows that only a sync target you no longer use could have
settled (see [`sync-namespaces.md`](./sync-namespaces.md)).

## Automatic migration (v13)

The migration runs on first start after upgrading and:

* adds `records.origin` (default `local`),
* flags rows matching the legacy `synced/` placeholder or the merge
  fingerprint as `synced`,
* removes `sync_record_state` bookkeeping for those rows.

It never deletes records. After it runs, contaminated rows stop being counted
as local usage and stop being uploaded; they remain visible through
`synced_records`.

## Opt-in cleanup: `aiusage sync --repair`

Nothing is deleted automatically. The repair command reports first:

```
aiusage sync --repair                    # dry run: this device's namespace + local DB
aiusage sync --repair --all-namespaces   # dry run, also inspect other devices' namespaces
```

The report lists, per namespace, how many lines are foreign-device lines,
echoes, stale (this device's namespace only) or duplicates, plus the local
rows that would be re-flagged or removed and any wire-id collisions among
local records. Apply it with:

```
aiusage sync --repair --apply
aiusage sync --repair --apply --all-namespaces
```

`--apply` performs, in this order:

1. re-flags local rows that are provably pulled copies as `origin = 'synced'`,
2. deletes echo rows from `synced_records` and their merged copies in
   `records` (the originals remain),
3. removes stale `sync_record_state` rows,
4. rewrites the affected remote files without the foreign, echo, stale and
   duplicate lines (deleting a file only if nothing legitimate is left),
   refreshes the manifest of every namespace it changed, then commits and
   pushes (GitHub) or uploads (S3).

Remote namespaces are read the way `aiusage sync` reads them: through the
namespace manifest when there is one (only the files it names count), every
listed file otherwise. A namespace that cannot be verified — a manifest that
does not parse or does not match its files, a named file that is missing, a
malformed line — is reported as *NOT verified* and **left untouched**, even
with `--apply`: rewriting it and publishing a manifest over the result could
turn a half-written or corrupt state into the authoritative snapshot for
every peer. For this device's own namespace the next `aiusage sync`
republishes the snapshot from the local database, after which `--repair`
verifies it again; another device's namespace is settled by its owner's next
sync. See *Remote cleanup and repair* in
[`sync-namespaces.md`](./sync-namespaces.md) for what bounds a repair that
overlaps an owner's publish on S3.

Recommended order for a fleet of devices:

1. Upgrade every device. From the first sync onwards the bug cannot recur, and
   echoes still present remotely are ignored on pull (reported as
   `ignored: N foreign`).
2. On one device run `aiusage sync --repair --all-namespaces`, review the
   report, then re-run with `--apply`.
3. On every other device run `aiusage sync --repair --apply` (local database
   only needs cleaning there; its namespace was already rewritten in step 2).
4. Run `aiusage sync` everywhere. Totals should now agree on all machines.

The cloud backend has no per-device namespaces; `--repair` there cleans only
the local database.

## Forgetting a sync target: `--forget-target`

Every sync target this device has ever used keeps counting (see *Target
identity* in [`sync-namespaces.md`](./sync-namespaces.md)): the rows its
claims name are never pruned, and unresolved rows wait for a verdict from it.
A target that is never synced again therefore keeps rows alive forever — most
commonly the key a non-default branch, prefix or endpoint configuration used
up to 1.5.17, which the upgrade keeps in place because it may also be the
default configuration's key. Plain `--repair` cannot help there: its orphan
rule only looks at rows with no claim at all, and those rows still have one.

The dry run of `--repair` names every key other than the configured one:

```
Other sync targets this device still counts: github:org/usage
  Rows only such a target claims are never pruned, and unresolved rows wait for its verdict, until it syncs again.
  If one of them will never be synced again, release it with "aiusage sync --repair --forget-target <key>" ...
```

For the most common case — the key this configuration used up to 1.5.17 —
`aiusage sync` prints the same hint after every successful sync, for as long
as the key is listed in `state.json` or still holds claims or verdicts:

```
  Note: this device still counts "github:org/usage", the key clients up to 1.5.17 used for this configuration. ...
  If nothing syncs under it any more (...), release it: aiusage sync --repair --forget-target "github:org/usage"
```

Both are hints only. Nothing tells the device whether a key is abandoned or
merely idle, so nothing acts on it. If you know the key will never be synced
again:

```
aiusage sync --repair --forget-target <key>            # dry run: report what would change
aiusage sync --repair --forget-target <key> --apply    # perform it
```

The report lists the key, how many claims, namespace verdicts, publish
bookkeeping rows and retired wire ids it holds, and how many pulled records
would lose their *last* claim and become unresolved. With `--apply`:

1. in one database transaction, the sync tick is taken *before* anything
   changes, the key's rows are deleted from `sync_record_claims`,
   `sync_namespace_verdicts`, `sync_record_state` and
   `sync_retired_wire_ids`, and every `synced_records` row left without a
   claim is marked unresolved at that tick (rows that were unresolved
   already keep their tick);
2. after that commits, the key is removed from `state.json` (consent,
   last-sync status, and `lastSyncTarget` if it was the last target synced).

**Nothing is deleted by the forget itself.** The released rows are pruned by
the normal sync path, once every remaining known target has synced again and
judged their namespace at a later tick: rows a target still carries are
claimed and kept, the others are removed. So after `--apply`, run
`aiusage sync` for each remaining target (the report lists them). Until then
the released rows are simply unresolved.

The two-step order makes an interruption harmless. If the process dies
between the database commit and the state write, the key is still a known
target, so the released rows keep waiting and nothing is pruned early; running
the same command again changes nothing in the database and finishes the state
update. The old key is not brought back by the legacy-key adoption either —
its rows are gone, so there is nothing left to copy. If you later sync under
the forgotten key after all, it becomes a known target again the normal way
and its rows are pulled again.

`--forget-target` refuses the configured target (including `cloud` while the
cloud is the configured backend) and any key nothing is recorded under, and it
is a usage error without `--repair`. It only touches the local database and
`state.json` — it needs no consent and does not read or write the remote — so
it works with the cloud backend configured as well.

## Manual procedure (if you prefer not to use the command)

For each file under `data/<owner>/`:

1. Drop every line whose `deviceInstanceId` is neither `<owner>` nor `unknown`.
2. Collect `sessionKey` of every line in **all** namespaces (before dropping
   anything, so chains of echoes resolve).
3. Drop every line whose `sessionKey` equals
   `sha256(line.device + "\0" + K)` truncated to 24 hex characters for some
   collected key `K`.

Locally, after upgrading (migration v13 has run):

```sql
DELETE FROM synced_records WHERE device_instance_id = '<this device id>';
DELETE FROM records WHERE origin = 'synced' AND id NOT IN (SELECT id FROM synced_records);
DELETE FROM sync_record_state WHERE record_id IN (SELECT id FROM records WHERE origin = 'synced');
```

then run `aiusage sync`.

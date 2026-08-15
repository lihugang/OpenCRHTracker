# Daily EMU Route Status Migration Plan

## Document purpose

This document is the implementation handoff for replacing the temporary
`probe_status` table with a persistent `status` column on
`daily_emu_routes`.

It records the decisions reached during the design discussion, including the
status encoding, runtime behavior, notification policy, data migration,
provenance database reset, API changes, exclusions, and required validation.
Future implementers should treat the decisions marked as confirmed as the
source of truth and should not silently reinterpret them.

This document describes planned work. At the time it was written, the runtime
and database migration had not yet been implemented.

## Goals

1. Make the result of train formation probing persistent historical data.
2. Store that result directly on each `daily_emu_routes` row.
3. Remove the `probe_status` table and all runtime code that treats it as a
   second source of truth.
4. Preserve the current train and EMU subscription notification behavior while
   broadening notifications to every change whose destination is confirmed.
5. Provide a one-time migration for all existing route data.
6. Keep the storage model to a single `status` column. Do not add separate
   confirmation, formation, fault, hot-spare, source, or timestamp columns.

## Non-goals

The following work is explicitly out of scope:

- Do not implement fault detection.
- Do not implement hot-spare detection.
- Do not infer coupled position I or II in the existing probe pipeline.
- Do not add extra status-related columns to `daily_emu_routes`.
- Do not retain runtime compatibility with the old `probe_status` schema.
- Do not migrate historical data in the train provenance database.
- Do not change v1 API responses.
- Do not change the Vue frontend in this work.
- Do not add status to the existing CSV daily export format.
- Do not add SQLite `CHECK` constraints for status values or combinations.
- Do not run the full `pnpm typecheck` command or `pnpm build` after
  implementation.

## Storage model

### Column definition

Add the following required column to `daily_emu_routes`:

```sql
status INTEGER NOT NULL
```

The column must not have a default. Every insertion path must provide an
explicit status. A missing status is an implementation error rather than a
condition that should silently become zero.

SQLite must not enforce status semantics with a `CHECK` constraint. Status
interpretation and updates belong to the application codec.

### Five-bit protocol

`status` is a bitmask with this stable internal layout:

| Bits | Mask | Meaning |
| --- | ---: | --- |
| `bit0` | `0x01` | Formation result is confirmed |
| `bit1..bit2` | `0x06` | Formation position |
| `bit3` | `0x08` | Fault flag |
| `bit4` | `0x10` | Hot-spare flag |

Formation position values are stored inside `bit1..bit2`:

| Meaning | Encoded value |
| --- | ---: |
| Single formation | `0x00` |
| Coupled formation, position unknown | `0x02` |
| Coupled formation, position I | `0x04` |
| Coupled formation, position II | `0x06` |

The base states are therefore:

| Semantic state | Value |
| --- | ---: |
| Unconfirmed single formation | `0x00` |
| Confirmed single formation | `0x01` |
| Unconfirmed coupled formation, position unknown | `0x02` |
| Confirmed coupled formation, position unknown | `0x03` |
| Unconfirmed coupled formation I | `0x04` |
| Confirmed coupled formation I | `0x05` |
| Unconfirmed coupled formation II | `0x06` |
| Confirmed coupled formation II | `0x07` |

Fault and hot-spare flags are added independently:

```text
fault     = baseStatus | 0x08
hotSpare  = baseStatus | 0x10
```

The encoding correction made during design review is important:
confirmed coupled formation II is `0x07`, not `0x09`. `0x09` means confirmed
single formation with the fault flag.

### Combination policy

The bit domains are intentionally composable.

- Do not reject fault and hot-spare both being set.
- Do not require a fault or hot-spare state to be confirmed.
- Do not add application or SQLite validation for those combinations.
- Preserve and decode the raw value even when it is not currently produced by
  a probe implementation.
- Values containing bits outside the known `0x1f` mask, non-integers, or other
  structurally unreadable inputs should be handled defensively by the codec.
  A bad row must not make an entire history response fail.

### Shared codec

Create one shared status codec or utility as the only authoritative location
for:

- bit masks and formation position constants;
- encoding and decoding;
- `isConfirmed(status)`;
- reading and changing formation/confirmation bits;
- reading and changing the fault bit;
- reading and changing the hot-spare bit;
- preserving unrelated bits during a domain-specific update;
- defensive decoding and `invalid_emu_route_status` logging where applicable.

Do not compare statuses by numeric magnitude. All existing uses of
`status > otherStatus`, `previousStatus < resolvedStatus`, `Math.max(status)`,
or equivalent ordering must be removed. The bitmask has no meaningful total
order.

Do not scatter numeric bit literals through services. Use named codec
constants and helpers.

## Runtime probe migration

### Old-to-new runtime mapping

The current three probe states map as follows:

| Old `ProbeStatusValue` | New route status |
| --- | ---: |
| `PendingCouplingDetection` | `0x00`, unconfirmed single |
| `SingleFormationResolved` | `0x01`, confirmed single |
| `CoupledFormationResolved` | `0x03`, confirmed coupled, position unknown |

The existing probe code must not emit coupled position I, coupled position II,
fault, or hot-spare states.

The pending state remains unconfirmed single because the current runtime first
records the main EMU as non-coupled while delayed coupled detection is pending.

### Single source of truth

After migration, all runtime status reads and writes must use
`daily_emu_routes.status`. There must be no compatibility read, fallback read,
dual write, or shadow write to `probe_status`.

Remove the old status store and SQL once all consumers have moved:

- `server/services/probeStatusStore.ts`;
- `assets/sql/emu/schema/createProbeStatusTable.sql`;
- probe-status query and maintenance SQL;
- probe-status migration helpers that no longer have a valid purpose;
- imports, types, admin counters, and documentation that model
  `probe_status` as a live table.

Historical standalone scripts must also be updated or retired if they assume
the old table exists. Generated code after the change must describe only the
status on daily EMU routes.

### Atomic route persistence

Refactor the current tracking persistence flow so route insertion and status
updates happen in a single EMU database transaction.

For each affected train code and EMU:

1. Resolve the service date and timetable identity.
2. Read the existing `daily_emu_routes` row and previous status, if present.
3. Insert a new route with an explicit status, or update the existing route's
   applicable status bits.
4. Preserve fault and hot-spare bits when the current formation probe changes
   only confirmation and formation position.
5. Produce a route mutation only from the committed before/after route state.
6. Commit the complete group before attempting notifications.

The current delete-and-reinsert route behavior requires special care because
it can change IDs or lose status. The implementation must preserve the
intended route identity and must not accidentally reset unrelated status bits.

### Domain-specific bit updates

The update contract is fixed even though two domains are not yet implemented:

- formation probing replaces only `confirmed` and `formationPosition`;
- future fault probing replaces only `fault`;
- future hot-spare probing replaces only `hotSpare`.

One probe domain must not erase data owned by another domain.

### Idempotence

Writing the same status again is a no-op for status-change semantics:

- do not record a status update when `previousStatus === nextStatus`;
- do not send a notification;
- do not treat a repeated successful probe as a new state transition.

Route creation and other provenance-worthy route changes may still be recorded
according to the existing mutation semantics, but there is only one
`daily_emu_routes` mutation model after this work.

## Notification policy

### Trigger rule

Use this exact rule:

```text
notify = previousStatus !== destinationStatus
         AND isConfirmed(destinationStatus)
```

Consequences:

- unconfirmed to confirmed sends a notification;
- confirmed single to confirmed coupled sends a notification;
- confirmed coupled with unknown position to confirmed position I or II sends
  a notification;
- a future confirmed fault or hot-spare flag change sends a notification;
- any transition whose destination is unconfirmed does not send a
  notification, including a downgrade from confirmed to unconfirmed;
- writing the same confirmed status again does not send a notification.

Do not add exceptions based on source status.

### Aggregation and subscribers

Keep the existing subscription model:

- train subscribers receive at most one notification for a train and service
  instance, even if several route rows changed;
- EMU subscribers receive at most one notification for each changed EMU and
  service instance;
- aliases and multiple coupled route rows must not create duplicate train
  notifications;
- notification payloads read the committed route rows, not the removed
  `probe_status` table.

### Failure behavior

Persist first, notify second.

- A push failure is logged.
- A push failure does not roll back route status.
- The implementation does not add an outbox or guaranteed-delivery system.
- A later identical probe does not automatically resend the failed
  notification because the status is already unchanged.

The one-time data migration must not send notifications.

## Daily cleanup task

The daily task remains, but it must be renamed to:

```text
clear_daily_probe_untrusted_records
```

Its sole database responsibility is clearing `probe_untrusted_records` via
`clearProbeUntrustedRecords()`.

It must never clear or modify `daily_emu_routes.status`.

Update all related surfaces:

- executor name and registration;
- task scheduling bootstrap and startup catch-up behavior;
- task executor allowlists in configuration parsing and JSON schema;
- documentation and logs;
- any admin text or task names that still reference
  `clear_daily_probe_status`.

This cleanup must remain because an old untrusted marker can otherwise block a
valid later probe indefinitely.

## One-time EMU database migration

### Script contract

Create:

```text
scripts/migrate-emu-routes-status.mjs
```

Supported arguments:

```text
--today YYYYMMDD
--apply
--db <path>
```

Behavior:

- without `--apply`, perform a dry-run only;
- default the EMU database path from runtime configuration unless `--db` is
  supplied;
- default `--today` to the Asia/Shanghai date determined at script start;
- freeze the selected service day for the whole run and print it prominently;
- production execution should pass `--today` explicitly;
- run only while the application and task workers are stopped.

### Schema rebuild

SQLite will require a table rebuild to add a required column without a
default. The migration must:

1. Create a new `daily_emu_routes` table with `status INTEGER NOT NULL`.
2. Preserve every existing route ID.
3. Preserve train code, EMU ID, service date, and timetable ID.
4. Recreate all route indexes and uniqueness behavior.
5. Restore `sqlite_sequence` consistently with the highest preserved route ID.
6. Verify the route ID set and row count before replacing the old table.

Do not silently renumber route IDs. Admin workflows, external clients, and
provenance records can refer to them.

### Today's data

For the fixed `--today` service date, read the old `probe_status` table.

Map old statuses as follows:

| Old status | New status |
| --- | ---: |
| Pending coupling detection | `0x00` |
| Single formation resolved | `0x01` |
| Coupled formation resolved | `0x03` |

Within the same current-day logical route group, old status precedence is:

```text
coupled resolved > single resolved > pending
```

This is explicit migration precedence for the old three-state model. It is not
numeric ordering for the new bitmask.

Apply the selected group status to the corresponding daily route rows.

If a current-day route has no matching old probe row, infer an unconfirmed
fallback from the distinct EMU count in its route group:

- one distinct EMU: `0x00`, unconfirmed single;
- more than one distinct EMU: `0x02`, unconfirmed coupled, position unknown.

Report the number of route rows and groups that used this fallback.

### Historical data

For every service date before `--today`, do not consult `probe_status`.

Read `daily_emu_routes` in service-day batches. Within each day, group rows by:

```text
train_prefix
train_number
service_date
timetable_id
```

For a `NULL` timetable ID, rows with the same train and service date remain in
the same `NULL` timetable group.

Assign status from distinct EMU count:

- exactly one distinct `emu_id`: `0x01`, confirmed single;
- more than one distinct `emu_id`: `0x03`, confirmed coupled, position
  unknown.

The migration does not attempt to infer coupled position I or II.

### Per-day progress

Print progress for every service date. At minimum, include:

- service date and position in the total day count;
- scanned route rows;
- updated route rows;
- single groups and rows;
- coupled groups and rows;
- missing current-day probe mappings where applicable;
- anomaly or failure counts.

An empty day is allowed and should be reported as zero rows if it appears in
the selected processing range.

Each day's route transformation should be atomic. A failed day rolls back its
changes and stops the migration. The script must not continue to table deletion
after any failed day.

### Verification and old table deletion

Before deleting `probe_status`, verify:

- total route row count is unchanged;
- the complete route ID set is unchanged;
- every route has a non-null integer status;
- all discovered service days were processed;
- today's mapping totals reconcile;
- historical single/coupled totals reconcile;
- duplicate route identities have not been introduced;
- foreign key checks pass;
- all expected indexes exist;
- the rebuilt sequence is valid.

Also report old probe rows that do not match any current-day route. Do not
create artificial route rows from orphaned probe data.

Only after all checks pass should the migration delete `probe_status` by
default. No old-schema compatibility table remains in the final EMU database.

Dry-run output should include the expected final distribution without writing
or deleting anything.

## Train provenance database reset

Do not migrate existing train provenance records to the new mutation format.

The migration script must reset the provenance database during `--apply` after
the EMU migration is known to be valid.

### Backup

The configured database is currently `data/train-provenance.db`. Resolve the
actual path through configuration rather than assuming it in code.

Before deletion:

1. Open the source database consistently.
2. Use SQLite's backup API, not a plain file copy, because the source uses WAL.
3. Write a timestamped backup under the configured backup area, for example:

   ```text
   data/backup/train-provenance.pre-emu-route-status-YYYYMMDD-HHMMSS.db
   ```

4. Open the backup and verify it is readable.
5. Record basic schema/table counts in the migration report.

If backup or backup verification fails, stop. Do not delete the source
provenance database or `probe_status`.

### Deletion and recreation

After a verified backup, delete only these resolved, explicit files:

```text
train-provenance.db
train-provenance.db-wal
train-provenance.db-shm
```

Do not use a broad glob. Do not delete the timestamped backup or any other
database.

Recreate the empty database by reusing every current SQL file under:

```text
assets/sql/train-provenance/schema
```

Do not duplicate provenance `CREATE TABLE` statements inside the migration
script. Verify the new database can be opened and report the recreated table
count.

The maintenance window must keep the application and workers stopped for this
entire operation. The migration does not produce provenance events about
itself.

## Provenance runtime model after reset

After implementation, tracking mutations must describe only
`daily_emu_routes`.

- Remove `'probe_status'` from the mutation table union.
- Remove separate probe status created/updated/deleted/unchanged counters.
- Store `previousStatus` and `nextStatus` on the daily route mutation.
- Remove `probeStatusRows` from admin provenance response models.
- Update proto source and generated code accordingly.
- Update server-side admin provenance adapters and services.

No attempt is made to preserve old provenance records. The one-time script
backs up and replaces the whole database.

The Vue frontend is not part of this change. Backend changes should avoid
unnecessary page edits. If generated/shared type changes expose pre-existing
frontend compile errors, do not expand the requested validation scope merely to
redesign the page.

## API and generated contract changes

### V2 only

Add `status` to every v2 JSON route representation, including route data used
by:

- daily records;
- train history;
- EMU history;
- admin daily-route responses;
- anomaly route responses;
- train provenance route responses and mutations;
- other v2 JSON responses that serialize a `daily_emu_routes` record.

Use:

```text
status: number
```

The API returns the raw integer bitmask. Do not also add a label or a decomposed
status object in this change.

Update all relevant v2 layers:

- domain response types;
- adapters;
- v2 JSON schemas and manifest definitions;
- `proto/opencrh/v2/*.proto` sources;
- generated protobuf TypeScript;
- generated v2 API schemas, OpenAPI, or documentation artifacts that are
  normally committed by this repository.

The proto field must be an additive field with an appropriate unused field
number. Do not reuse a removed field number in a way that could make an old
payload decode as the wrong concept.

### Explicit exclusions

- Do not change v1 handlers or v1 response shapes.
- Do not add status to CSV exports.
- Do not update Vue pages to display or decode status yet.

Unknown JSON fields are expected to be ignored by the existing frontend.

## Other affected code

The implementation must search the whole repository for assumptions about
`probe_status`, `ProbeStatusValue`, and numeric status ordering. Known affected
areas include:

- probe departure execution;
- QR code probe resolution;
- delayed coupled-group detection;
- current-day timetable ID synchronization;
- event notifications and notification payload construction;
- anomaly deletion and admin daily-route maintenance;
- train provenance collection and admin provenance responses;
- alias remapping and timetable history repair scripts;
- route reorder/rebuild scripts;
- task configuration schemas and documentation;
- generated proto and API artifacts.

When synchronizing timetable identities or deduplicating route rows, merge
status through explicit bit-domain rules. Do not select a status with numeric
maximum.

Deleting a route no longer has a secondary probe-status deletion count.
Response fields and protobuf fields that expose deleted probe rows should be
removed or replaced consistently in v2. V1 is not being changed.

## Implementation sequence

Use this order to avoid temporarily introducing two competing models:

1. Add the shared status codec and focused server-side tests only if a suitable
   local testing pattern exists. Do not introduce a new test framework solely
   for this change.
2. Extend the daily route row/store model and SQL to require and return status.
3. Refactor probe persistence, coupled detection, status lookup, notification,
   timetable sync, admin maintenance, and provenance mutation generation to use
   route status.
4. Remove runtime `probe_status` dependencies and numeric ordering.
5. Rename and narrow the daily cleanup task.
6. Update v2 types, proto sources, adapters, schemas, and generated artifacts.
7. Update auxiliary scripts that must operate against the new final schema.
8. Add the one-time EMU/provenance migration script and supporting SQL assets.
   Repository rules prohibit inline SQL, so SQL used by the migration
   belongs under `assets/sql/emu/migrations` or another existing SQL scope.
9. Run the migration in dry-run mode against a safe database copy.
10. Run the migration with `--apply` against a disposable copy and verify the
    full report.
11. Run the single authorized validation command.

## Validation constraint

After implementation, run only:

```text
pnpm typecheck:server
```

Do not run:

```text
pnpm typecheck
pnpm build
```

This restriction supersedes the repository's usual broader validation advice
for this task. The final implementation report must explicitly state that only
`pnpm typecheck:server` was run and that full typecheck/build were intentionally
not run at the user's request.

Migration verification commands against safe database copies are still part of
the work because they validate the migration script rather than the Nuxt build.
They must not modify the production database unless the user separately asks
for the production migration to be executed.

## Maintenance-window runbook

The intended production sequence is:

1. Deploy or stage the new code and migration script without starting the new
   application process against the old database.
2. Stop the application and every task worker that can access the EMU or
   provenance databases.
3. Back up the EMU database through the normal operational process.
4. Run the migration dry-run with an explicit `--today YYYYMMDD`.
5. Review per-day counts, today's old-status mappings, orphaned probe counts,
   and expected final status distribution.
6. Run the migration with `--apply` and the same explicit `--today`.
7. Confirm that the script reports preserved route IDs and counts, deleted
   `probe_status`, and the verified provenance backup/rebuild.
8. Start only the new application version.
9. Confirm that route reads return status and probe tasks can update route
   status.
10. Confirm that an unconfirmed destination does not notify and a changed
    confirmed destination does notify once per subscribed target.

Old and new application versions must not run concurrently across this schema
change. There is no dual-write or old-schema compatibility period.

## Confirmed decision log

The following points were explicitly confirmed during the design discussion:

- `probe_status` will be removed.
- `daily_emu_routes.status` is the sole persistent status field.
- Status uses one confirmation bit, two formation-position bits, one fault bit,
  and one hot-spare bit.
- Fault and hot-spare are reserved but their detection is not implemented.
- Fault/hot-spare combinations are not validated or restricted.
- Confirmed coupled with unknown position is a real state distinct from
  unconfirmed coupled.
- Existing coupled detection maps to confirmed coupled with position unknown.
- Notifications depend only on a real status change and a confirmed
  destination.
- Destination-unconfirmed transitions never notify.
- Existing train/EMU subscription aggregation and best-effort delivery remain.
- Daily cleanup remains only for untrusted probe records and is renamed.
- Historical routes are inferred per service day from distinct EMU counts.
- Today's routes use old probe status, with an unconfirmed route-count fallback
  when the old row is missing.
- Migration prints per-day progress.
- `probe_status` is deleted by default only after successful verification.
- Route IDs are preserved.
- Provenance data is backed up, deleted, and rebuilt rather than migrated.
- Only v2 JSON/proto contracts receive status; v1, CSV, and Vue pages do not.
- Generated code must describe route status without a live probe-status model.
- Implementation validation is limited to `pnpm typecheck:server`.

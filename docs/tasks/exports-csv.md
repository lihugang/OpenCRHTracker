# Task: CSV-only exports (agent exports_csv)

Implement the CSV-only export refactor in /root/crhdata/OpenCRHTracker. This is the one domain where v1 behavior MAY change (only the two v1 export handlers). Work independently; do not ask questions.

## Read first

1. docs/api-v2-implementation-spec.md (full; sections 9, 16, 17, 14.7, 14.8 are the contract)
2. docs/api-v2-domain-modules.md (module mapping: `server/domain/exports.ts` with `getDailyExportIndex`, `getDailyExport`)
3. server/services/dailyExportStore.ts
4. server/services/taskExecutors/exportDailyRecordsTaskExecutor.ts
5. server/api/v1/exports/daily/index.get.ts and server/api/v1/exports/daily/[date].get.ts
6. server/services/emuRoutesStore.ts (`listDailyRecordsAll`, `DailyEmuRouteRow`)
7. scripts/migrate-users-schema.mjs (standalone-script pattern)

## Scope

Do not touch other v1 handlers, frontend, docs, nuxt.config.ts, or package.json.

1. server/services/dailyExportStore.ts:
   - Remove JSONL completely (no formats array, no jsonl serialization/path/count/read, no jsonl in index).
   - Rename `writeDailyExportFiles` -> `writeDailyExportFile(date, rows)` returning `{ filePath, total }`; file name stays `data/exports/YYYYMMDD.csv`; keep atomic write via `writeTextFileAtomically`.
   - CSV columns exactly: `trainCode,emuCode,startStation,endStation,startTime,endTime`, UTF-8 BOM, existing safe CSV escaping.
   - trainCode via `formatExternalTrainCode`; emuCode via `formatExternalEmuCode(row.emu_id)`; never output prefix/number, emuId, serviceDay, timetableId or mapping blocks.
   - Times in Asia/Shanghai, record's actual departure natural day is D=0. startTime always HH:MM (truncate, never round). endTime same-day HH:MM, next-day HH:MM+1, multi-day HH:MM+D without cap. Invalid startAt -> ''. Invalid or earlier endAt -> '' plus warning log (repo logger pattern; console.warn acceptable). Never '00:00', negative suffixes, raw timestamps.
   - Sort: valid startAt ascending, missing startAt last, tiebreak trainCode, emuCode, record id ascending.
   - `readDailyExportText(date)` -> string|null; `countDailyExportItems(content)` -> number (no format arg).
   - `listDailyExportIndex(year?, month?)` keeps selectedYear/selectedMonth/availableYears/availableMonths and year/month queries; items are `{ serviceDay: number }` (epoch day); formats removed.
2. Create server/domain/exports.ts: thin wrappers over the store, no H3Event, no headers, no external formatting. `getDailyExportIndex` returns index with items `{ serviceDay }`; `getDailyExport` returns `{ serviceDay, total, content }` (content includes BOM) and preserves v1 404 behavior/messages.
3. v1 export handlers (allowed incompatibility):
   - index.get.ts: keep year/month parsing and executeApi options; items `{ date: string }` (YYYYMMDD), formats removed.
   - [date].get.ts: remove format query; keep binary query; structured data `{ date, format: 'csv', total, content }`; binary=true returns raw `text/csv; charset=utf-8` with `Content-Disposition` attachment `filename="YYYYMMDD.csv"`.
4. exportDailyRecordsTaskExecutor.ts: use `writeDailyExportFile`, keep executor names/config/enqueue, log CSV only.
5. Remove remaining JSONL references in your scope; do NOT delete old data/exports/*.jsonl.
6. Create scripts/exports-v2-migrate.mjs (standalone Node; better-sqlite3; read data/config.json default, --config override; no server TS imports):
   - `SELECT DISTINCT service_date FROM daily_emu_routes ORDER BY service_date ASC`.
   - For each date load all rows mirroring `listDailyRecordsAll` SQL/joins exactly, write `data/exports/YYYYMMDD.csv` with the SAME generator rules. Add top comment: "Mirrors server/services/dailyExportStore.ts CSV generator; keep in sync."
   - `--dry-run` flag; default rebuilds. Never delete JSONL.
   - Do NOT edit package.json (coordinator adds the script entry).
7. Validation: `pnpm typecheck:server` must pass. Run `node scripts/exports-v2-migrate.mjs --dry-run` if the DB exists; otherwise report why.

## Report

New signatures in dailyExportStore.ts and server/domain/exports.ts; exact v1 export response shapes; every file changed; typecheck result; migrate dry-run output or reason not run.

CREATE TABLE IF NOT EXISTS provenance_task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scheduler_task_id INTEGER NOT NULL UNIQUE,
    executor TEXT NOT NULL,
    execution_time INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
    error_message TEXT NOT NULL DEFAULT '',
    task_args_json TEXT NOT NULL,
    service_date TEXT NOT NULL,
    primary_train_code TEXT NOT NULL DEFAULT '',
    primary_start_at INTEGER,
    primary_emu_code TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_provenance_task_runs_service_date_train
ON provenance_task_runs(service_date, primary_train_code, primary_start_at);

CREATE INDEX IF NOT EXISTS idx_provenance_task_runs_finished_at
ON provenance_task_runs(finished_at, started_at);

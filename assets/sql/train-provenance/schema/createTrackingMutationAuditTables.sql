CREATE TABLE IF NOT EXISTS tracking_mutation_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_run_id INTEGER,
    scheduler_task_id INTEGER,
    source TEXT NOT NULL,
    operation TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT '',
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    start_at INTEGER,
    detail_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracking_mutation_batches_service_date
ON tracking_mutation_batches(service_date, start_at, created_at, id);

CREATE TABLE IF NOT EXISTS tracking_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    daily_route_id INTEGER,
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL DEFAULT 0,
    emu_id INTEGER NOT NULL,
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    timetable_id INTEGER,
    start_at INTEGER,
    action TEXT NOT NULL,
    previous_status INTEGER,
    next_status INTEGER,
    detail_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES tracking_mutation_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracking_mutations_batch
ON tracking_mutations(batch_id, id);

CREATE INDEX IF NOT EXISTS idx_tracking_mutations_train
ON tracking_mutations(service_date, train_prefix, train_number, start_at, created_at, id);

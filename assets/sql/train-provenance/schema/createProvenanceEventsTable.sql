CREATE TABLE IF NOT EXISTS provenance_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_run_id INTEGER NOT NULL,
    sequence_no INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL DEFAULT 0 CHECK(train_number >= 0 AND train_number <= 9999),
    start_at INTEGER,
    emu_id INTEGER,
    related_train_prefix TEXT NOT NULL DEFAULT '',
    related_train_number INTEGER NOT NULL DEFAULT 0 CHECK(related_train_number >= 0 AND related_train_number <= 9999),
    related_emu_id INTEGER,
    event_type TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '',
    linked_scheduler_task_id INTEGER,
    payload_json TEXT NOT NULL,
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE,
    UNIQUE(task_run_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_provenance_events_task_run_sequence
ON provenance_events(task_run_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_provenance_events_service_train
ON provenance_events(service_date, train_prefix, train_number, start_at, created_at, id);

CREATE INDEX IF NOT EXISTS idx_provenance_events_linked_scheduler_task
ON provenance_events(linked_scheduler_task_id);

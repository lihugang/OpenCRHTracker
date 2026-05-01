CREATE TABLE IF NOT EXISTS provenance_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_run_id INTEGER NOT NULL,
    sequence_no INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    train_code TEXT NOT NULL DEFAULT '',
    start_at INTEGER,
    emu_code TEXT NOT NULL DEFAULT '',
    related_train_code TEXT NOT NULL DEFAULT '',
    related_emu_code TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '',
    linked_scheduler_task_id INTEGER,
    payload_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE,
    UNIQUE(task_run_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_provenance_events_task_run_sequence
ON provenance_events(task_run_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_provenance_events_train_date_start
ON provenance_events(service_date, train_code, start_at, created_at, id);

CREATE INDEX IF NOT EXISTS idx_provenance_events_linked_scheduler_task
ON provenance_events(linked_scheduler_task_id);

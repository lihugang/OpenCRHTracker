CREATE TABLE IF NOT EXISTS coupling_scan_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_run_id INTEGER NOT NULL,
    candidate_order INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    bureau TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    candidate_emu_code TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    scanned_train_code TEXT NOT NULL DEFAULT '',
    scanned_internal_code TEXT NOT NULL DEFAULT '',
    scanned_start_at INTEGER,
    matched_train_code TEXT NOT NULL DEFAULT '',
    matched_start_at INTEGER,
    train_repeat TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE,
    UNIQUE(task_run_id, candidate_order)
);

CREATE INDEX IF NOT EXISTS idx_coupling_scan_candidates_task_run_order
ON coupling_scan_candidates(task_run_id, candidate_order);

CREATE INDEX IF NOT EXISTS idx_coupling_scan_candidates_service_date_emu
ON coupling_scan_candidates(service_date, candidate_emu_code, created_at);

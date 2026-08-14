CREATE TABLE IF NOT EXISTS coupling_scan_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_run_id INTEGER NOT NULL,
    candidate_order INTEGER NOT NULL,
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    bureau TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    candidate_emu_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    scanned_train_prefix TEXT NOT NULL DEFAULT '',
    scanned_train_number INTEGER NOT NULL DEFAULT 0 CHECK(scanned_train_number >= 0 AND scanned_train_number <= 9999),
    scanned_internal_code TEXT NOT NULL DEFAULT '',
    scanned_start_at INTEGER,
    matched_train_prefix TEXT NOT NULL DEFAULT '',
    matched_train_number INTEGER NOT NULL DEFAULT 0 CHECK(matched_train_number >= 0 AND matched_train_number <= 9999),
    matched_start_at INTEGER,
    train_repeat TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE,
    UNIQUE(task_run_id, candidate_order)
);

CREATE INDEX IF NOT EXISTS idx_coupling_scan_candidates_task_run_order
ON coupling_scan_candidates(task_run_id, candidate_order);

CREATE INDEX IF NOT EXISTS idx_coupling_scan_candidates_service_emu
ON coupling_scan_candidates(service_date, candidate_emu_id, created_at);

CREATE INDEX IF NOT EXISTS idx_coupling_scan_candidates_service_train
ON coupling_scan_candidates(service_date, scanned_train_prefix, scanned_train_number, created_at);

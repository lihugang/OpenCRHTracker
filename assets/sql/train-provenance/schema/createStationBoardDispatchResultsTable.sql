CREATE TABLE IF NOT EXISTS station_board_dispatch_results (
    task_run_id INTEGER PRIMARY KEY,
    service_date TEXT NOT NULL,
    candidate_group_count INTEGER NOT NULL,
    selected_station_count INTEGER NOT NULL,
    selected_stations_json TEXT NOT NULL DEFAULT '[]',
    created_task_count INTEGER NOT NULL DEFAULT 0,
    reused_task_count INTEGER NOT NULL DEFAULT 0,
    skipped_not_found_count INTEGER NOT NULL DEFAULT 0,
    skipped_ambiguous_count INTEGER NOT NULL DEFAULT 0,
    detail_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_board_dispatch_results_service_date
ON station_board_dispatch_results(service_date, created_at DESC, task_run_id DESC);

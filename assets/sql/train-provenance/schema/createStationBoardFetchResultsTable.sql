CREATE TABLE IF NOT EXISTS station_board_fetch_results (
    task_run_id INTEGER PRIMARY KEY,
    service_date TEXT NOT NULL,
    parent_scheduler_task_id INTEGER,
    station_name TEXT NOT NULL,
    station_telecode TEXT NOT NULL,
    result_status TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    parsed_entry_count INTEGER NOT NULL DEFAULT 0,
    saved_entry_count INTEGER NOT NULL DEFAULT 0,
    consumed_queue_entry_count INTEGER NOT NULL DEFAULT 0,
    rows_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_board_fetch_results_parent_scheduler_task
ON station_board_fetch_results(service_date, parent_scheduler_task_id, created_at DESC, task_run_id DESC);

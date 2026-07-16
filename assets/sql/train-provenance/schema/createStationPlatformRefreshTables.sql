CREATE TABLE IF NOT EXISTS station_platform_refresh_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_run_id INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    start_at INTEGER,
    primary_train_code TEXT NOT NULL DEFAULT '',
    train_codes_json TEXT NOT NULL DEFAULT '[]',
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    cache_hit_count INTEGER NOT NULL DEFAULT 0,
    cache_fallback_count INTEGER NOT NULL DEFAULT 0,
    no_data_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_run_id) REFERENCES provenance_task_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_platform_refresh_results_task_run
ON station_platform_refresh_results(task_run_id, id);

CREATE INDEX IF NOT EXISTS idx_station_platform_refresh_results_train
ON station_platform_refresh_results(service_date, primary_train_code, start_at, created_at);

CREATE TABLE IF NOT EXISTS station_platform_refresh_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refresh_result_id INTEGER NOT NULL,
    station_order INTEGER NOT NULL,
    lookup_type TEXT NOT NULL,
    station_name TEXT NOT NULL,
    station_telecode TEXT NOT NULL,
    station_no INTEGER NOT NULL,
    train_date TEXT NOT NULL,
    station_train_codes_json TEXT NOT NULL DEFAULT '[]',
    attempted_train_codes_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL,
    platform_no INTEGER,
    wicket TEXT,
    fetched_at INTEGER,
    error_message TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (refresh_result_id) REFERENCES station_platform_refresh_results(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_platform_refresh_entries_result
ON station_platform_refresh_entries(refresh_result_id, station_order, id);

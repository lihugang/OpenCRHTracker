CREATE TABLE IF NOT EXISTS timetable_history_coverages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL CHECK(train_number >= 0 AND train_number <= 9999),
    service_date_start INTEGER NOT NULL,
    service_date_end_exclusive INTEGER NOT NULL,
    content_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK(service_date_start < service_date_end_exclusive),
    UNIQUE(train_prefix, train_number, service_date_start),
    FOREIGN KEY(content_id) REFERENCES timetable_history_contents(id)
);

CREATE INDEX IF NOT EXISTS idx_timetable_history_coverages_train_start
ON timetable_history_coverages(train_prefix, train_number, service_date_start DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_timetable_history_coverages_content_id
ON timetable_history_coverages(content_id);

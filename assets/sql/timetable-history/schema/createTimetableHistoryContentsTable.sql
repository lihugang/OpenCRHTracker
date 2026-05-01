CREATE TABLE IF NOT EXISTS timetable_history_contents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL UNIQUE,
    timetable_json TEXT NOT NULL,
    stop_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

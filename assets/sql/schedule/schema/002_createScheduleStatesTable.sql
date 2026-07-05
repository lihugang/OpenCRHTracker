CREATE TABLE IF NOT EXISTS schedule_states (
    kind TEXT PRIMARY KEY CHECK(kind IN ('published', 'building')),
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    phase TEXT NOT NULL,
    generated_at INTEGER NOT NULL,
    started_at_ms INTEGER NOT NULL,
    unique_items INTEGER NOT NULL,
    usable_timetable_count INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_states_date_kind
ON schedule_states(date, kind);

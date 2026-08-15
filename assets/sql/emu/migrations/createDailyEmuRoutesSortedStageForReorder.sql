CREATE TABLE daily_emu_routes_sorted_stage (
    original_id INTEGER NOT NULL,
    train_prefix TEXT NOT NULL,
    train_number INTEGER NOT NULL,
    emu_id INTEGER NOT NULL,
    service_date INTEGER NOT NULL,
    timetable_id INTEGER NULL,
    status INTEGER NOT NULL,
    start_at INTEGER NOT NULL
);

CREATE INDEX idx_daily_emu_routes_sorted_stage_start_at_original_id
ON daily_emu_routes_sorted_stage(start_at ASC, original_id ASC);

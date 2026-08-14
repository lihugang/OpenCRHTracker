CREATE TABLE IF NOT EXISTS daily_emu_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL CHECK(train_number >= 0 AND train_number <= 9999),
    emu_id INTEGER NOT NULL REFERENCES emu_code_mapping(id),
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    timetable_id INTEGER NULL,
    UNIQUE(train_prefix, train_number, emu_id, service_date, timetable_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_emu_routes_train_emu_service_timetable_resolved
ON daily_emu_routes(train_prefix, train_number, emu_id, service_date, timetable_id)
WHERE timetable_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_emu_routes_train_emu_service_unresolved
ON daily_emu_routes(train_prefix, train_number, emu_id, service_date)
WHERE timetable_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_train_service
ON daily_emu_routes(train_prefix, train_number, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_emu_service
ON daily_emu_routes(emu_id, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_service_id
ON daily_emu_routes(service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_timetable_id
ON daily_emu_routes(timetable_id, service_date DESC, id DESC);

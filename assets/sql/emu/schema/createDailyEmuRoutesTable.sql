CREATE TABLE IF NOT EXISTS daily_emu_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_code TEXT NOT NULL,
    emu_code TEXT NOT NULL,
    service_date TEXT NOT NULL,
    timetable_id INTEGER NULL,
    CHECK(service_date GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_emu_routes_train_emu_service_timetable_resolved
ON daily_emu_routes(train_code, emu_code, service_date, timetable_id)
WHERE timetable_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_emu_routes_train_emu_service_unresolved
ON daily_emu_routes(train_code, emu_code, service_date)
WHERE timetable_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_train_service
ON daily_emu_routes(train_code, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_emu_service
ON daily_emu_routes(emu_code, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_service_id
ON daily_emu_routes(service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_timetable_id
ON daily_emu_routes(timetable_id, service_date DESC, id DESC);

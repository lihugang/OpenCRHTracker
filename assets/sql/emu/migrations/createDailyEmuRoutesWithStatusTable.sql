CREATE TABLE daily_emu_routes_migrated_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL CHECK(train_number >= 0 AND train_number <= 9999),
    emu_id INTEGER NOT NULL REFERENCES emu_code_mapping(id),
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    timetable_id INTEGER NULL,
    status INTEGER NOT NULL,
    UNIQUE(train_prefix, train_number, emu_id, service_date, timetable_id)
);

CREATE TABLE IF NOT EXISTS probe_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL CHECK(train_number >= 0 AND train_number <= 9999),
    emu_id INTEGER NOT NULL REFERENCES emu_code_mapping(id),
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    timetable_id INTEGER NULL,
    status INTEGER NOT NULL CHECK (status IN (1, 2, 3))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_probe_status_train_emu_service_timetable_resolved
ON probe_status(train_prefix, train_number, emu_id, service_date, timetable_id)
WHERE timetable_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_probe_status_train_emu_service_unresolved
ON probe_status(train_prefix, train_number, emu_id, service_date)
WHERE timetable_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_probe_status_emu_service
ON probe_status(emu_id, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_status_train_service
ON probe_status(train_prefix, train_number, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_status_timetable_id
ON probe_status(timetable_id, service_date DESC, id DESC);

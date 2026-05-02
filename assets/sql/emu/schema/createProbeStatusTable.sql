CREATE TABLE IF NOT EXISTS probe_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_code TEXT NOT NULL,
    emu_code TEXT NOT NULL,
    service_date TEXT NOT NULL,
    timetable_id INTEGER NULL,
    status INTEGER NOT NULL CHECK (status IN (1, 2, 3))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_probe_status_train_emu_service_timetable_resolved
ON probe_status(train_code, emu_code, service_date, timetable_id)
WHERE timetable_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_probe_status_train_emu_service_unresolved
ON probe_status(train_code, emu_code, service_date)
WHERE timetable_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_probe_status_emu_service
ON probe_status(emu_code, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_status_train_service
ON probe_status(train_code, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_status_timetable_id
ON probe_status(timetable_id, service_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS probe_untrusted_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_code TEXT NOT NULL,
    emu_code TEXT NOT NULL,
    service_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_probe_untrusted_train_emu_service
ON probe_untrusted_records(train_code, emu_code, service_date);

CREATE INDEX IF NOT EXISTS idx_probe_untrusted_emu_service
ON probe_untrusted_records(emu_code, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_untrusted_train_service
ON probe_untrusted_records(train_code, service_date DESC, id DESC);

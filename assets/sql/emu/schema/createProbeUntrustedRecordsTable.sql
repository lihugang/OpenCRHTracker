CREATE TABLE IF NOT EXISTS probe_untrusted_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL CHECK(train_number >= 0 AND train_number <= 9999),
    emu_id INTEGER NOT NULL REFERENCES emu_code_mapping(id),
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_probe_untrusted_train_emu_service
ON probe_untrusted_records(train_prefix, train_number, emu_id, service_date);

CREATE INDEX IF NOT EXISTS idx_probe_untrusted_emu_service
ON probe_untrusted_records(emu_id, service_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_untrusted_train_service
ON probe_untrusted_records(train_prefix, train_number, service_date DESC, id DESC);

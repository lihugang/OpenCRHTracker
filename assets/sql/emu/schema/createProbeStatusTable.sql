CREATE TABLE IF NOT EXISTS probe_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_code TEXT NOT NULL,
    emu_code TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    status INTEGER NOT NULL CHECK (status IN (1, 2, 3))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_probe_status_train_emu_start_unique
ON probe_status(train_code, emu_code, start_at);

CREATE INDEX IF NOT EXISTS idx_probe_status_emu_code
ON probe_status(emu_code, start_at, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_status_train_code
ON probe_status(train_code, start_at, id DESC);

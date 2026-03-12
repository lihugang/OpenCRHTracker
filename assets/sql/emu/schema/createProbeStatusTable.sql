CREATE TABLE IF NOT EXISTS probe_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_code TEXT NOT NULL,
    emu_code TEXT NOT NULL,
    status INTEGER NOT NULL CHECK (status IN (1, 2, 3))
);

CREATE INDEX IF NOT EXISTS idx_probe_status_emu_code
ON probe_status(emu_code, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_status_train_code
ON probe_status(train_code, id DESC);

CREATE TABLE IF NOT EXISTS probe_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_code TEXT NOT NULL,
    emu_train_set_no TEXT NOT NULL,
    status INTEGER NOT NULL CHECK (status IN (1, 2, 3))
);

CREATE INDEX IF NOT EXISTS idx_probe_status_emu_train_set_no
ON probe_status(emu_train_set_no, id DESC);

CREATE INDEX IF NOT EXISTS idx_probe_status_train_code
ON probe_status(train_code, id DESC);

CREATE TABLE IF NOT EXISTS failed_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emu_code TEXT NOT NULL,
    seat_code TEXT NOT NULL,
    reason TEXT NOT NULL,
    checked_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expected_train_code TEXT NOT NULL DEFAULT '',
    detected_train_code TEXT NOT NULL DEFAULT '',
    detected_emu_code TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_failed_codes_emu_checked
ON failed_codes(emu_code, checked_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_failed_codes_reason_checked
ON failed_codes(reason, checked_at DESC, id DESC);

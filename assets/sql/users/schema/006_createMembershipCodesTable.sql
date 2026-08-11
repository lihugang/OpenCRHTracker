CREATE TABLE IF NOT EXISTS membership_codes (
    code TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    used_at INTEGER,
    used_by TEXT,
    CHECK (
        (used_at IS NULL AND used_by IS NULL)
        OR (used_at IS NOT NULL AND used_at > 0 AND used_by IS NOT NULL)
    ),
    FOREIGN KEY (batch_id) REFERENCES membership_code_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (used_by) REFERENCES users(username)
);

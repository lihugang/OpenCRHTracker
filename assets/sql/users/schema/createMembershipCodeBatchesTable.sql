CREATE TABLE IF NOT EXISTS membership_code_batches (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at > 0),
    FOREIGN KEY (created_by) REFERENCES users(username)
);

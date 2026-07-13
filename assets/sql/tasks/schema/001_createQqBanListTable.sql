CREATE TABLE IF NOT EXISTS qq_ban_list (
    qq_number TEXT PRIMARY KEY,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    added_at INTEGER NOT NULL,
    added_by TEXT NOT NULL,
    removed_at INTEGER,
    removed_by TEXT
);

CREATE INDEX IF NOT EXISTS qqBanListActiveAddedAtIndex
ON qq_ban_list(is_active, added_at DESC);

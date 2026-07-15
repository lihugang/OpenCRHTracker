CREATE TABLE IF NOT EXISTS user_memberships (
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    starts_at INTEGER NOT NULL CHECK (starts_at > 0),
    expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > starts_at),
    source TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    revoked_at INTEGER,
    revoked_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(username),
    FOREIGN KEY (revoked_by) REFERENCES users(username)
);

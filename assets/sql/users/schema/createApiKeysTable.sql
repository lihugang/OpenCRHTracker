CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    revoke_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    issuer TEXT NOT NULL,
    active_from INTEGER NOT NULL,
    revoked_at INTEGER,
    expires_at INTEGER NOT NULL,
    daily_token_limit INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE
);

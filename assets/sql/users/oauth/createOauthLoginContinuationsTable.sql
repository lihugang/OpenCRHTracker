CREATE TABLE IF NOT EXISTS oauth_login_continuations (
    continuation_id TEXT PRIMARY KEY,
    request_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

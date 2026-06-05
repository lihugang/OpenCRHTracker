CREATE TABLE IF NOT EXISTS oauth_client_scope_requests (
    client_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    review_status TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at INTEGER,
    PRIMARY KEY (client_id, scope),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(username) ON DELETE SET NULL
);

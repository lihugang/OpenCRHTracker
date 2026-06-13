CREATE TABLE IF NOT EXISTS oauth_client_admin_grants (
    client_id TEXT NOT NULL,
    grant_key TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    updated_by TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (client_id, grant_key),
    FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(username) ON DELETE SET NULL
);

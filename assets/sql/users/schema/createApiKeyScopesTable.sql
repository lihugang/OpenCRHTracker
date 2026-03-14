CREATE TABLE IF NOT EXISTS api_key_scopes (
    key_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    PRIMARY KEY (key_id, scope),
    FOREIGN KEY (key_id) REFERENCES api_keys(key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_ban_fingerprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    first_action_id INTEGER NOT NULL,
    latest_action_id INTEGER NOT NULL,
    last_banned_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE (ip_address, user_agent),
    FOREIGN KEY (first_action_id) REFERENCES user_ban_actions(id),
    FOREIGN KEY (latest_action_id) REFERENCES user_ban_actions(id)
);

CREATE INDEX IF NOT EXISTS userBanFingerprintsExpiresAtIndex
ON user_ban_fingerprints(expires_at);

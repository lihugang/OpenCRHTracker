CREATE TABLE IF NOT EXISTS user_ban_fingerprint_exemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    fingerprint_id INTEGER NOT NULL,
    unban_action_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE (user_id, fingerprint_id),
    FOREIGN KEY (fingerprint_id) REFERENCES user_ban_fingerprints(id) ON DELETE CASCADE,
    FOREIGN KEY (unban_action_id) REFERENCES user_ban_actions(id)
);

CREATE INDEX IF NOT EXISTS userBanFingerprintExemptionsExpiryIndex
ON user_ban_fingerprint_exemptions(expires_at);

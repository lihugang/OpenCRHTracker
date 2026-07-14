CREATE TABLE IF NOT EXISTS user_risk_fingerprint_exemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    fingerprint_id INTEGER NOT NULL,
    risk_case_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE (user_id, fingerprint_id),
    FOREIGN KEY (fingerprint_id) REFERENCES user_ban_fingerprints(id) ON DELETE CASCADE,
    FOREIGN KEY (risk_case_id) REFERENCES user_risk_cases(id)
);

CREATE INDEX IF NOT EXISTS userRiskFingerprintExemptionsExpiryIndex
ON user_risk_fingerprint_exemptions(expires_at);

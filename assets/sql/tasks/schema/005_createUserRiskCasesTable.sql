CREATE TABLE IF NOT EXISTS user_risk_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending',
            'active',
            'escalating',
            'escalated',
            'failed',
            'cleared'
        )
    ),
    fingerprint_id INTEGER,
    matched_action_id INTEGER NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    qq_number TEXT,
    ban_action_id INTEGER,
    detected_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    escalated_at INTEGER,
    cleared_at INTEGER,
    cleared_by TEXT,
    error_message TEXT,
    FOREIGN KEY (fingerprint_id) REFERENCES user_ban_fingerprints(id) ON DELETE SET NULL,
    FOREIGN KEY (matched_action_id) REFERENCES user_ban_actions(id),
    FOREIGN KEY (ban_action_id) REFERENCES user_ban_actions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS userRiskCasesOpenUserIndex
ON user_risk_cases(user_id)
WHERE status IN ('pending', 'active', 'escalating', 'escalated', 'failed');

CREATE INDEX IF NOT EXISTS userRiskCasesDetectedAtIndex
ON user_risk_cases(detected_at DESC, id DESC);

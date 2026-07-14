INSERT INTO user_risk_fingerprint_exemptions (
    user_id,
    fingerprint_id,
    risk_case_id,
    created_at,
    created_by,
    expires_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id, fingerprint_id) DO UPDATE SET
    risk_case_id = excluded.risk_case_id,
    created_at = excluded.created_at,
    created_by = excluded.created_by,
    expires_at = excluded.expires_at

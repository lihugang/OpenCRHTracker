SELECT
    user_id,
    fingerprint_id,
    expires_at
FROM user_risk_fingerprint_exemptions
WHERE expires_at > ?

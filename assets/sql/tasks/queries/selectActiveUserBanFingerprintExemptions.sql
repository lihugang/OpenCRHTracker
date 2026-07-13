SELECT
    user_id,
    fingerprint_id,
    expires_at
FROM user_ban_fingerprint_exemptions
WHERE expires_at > ?

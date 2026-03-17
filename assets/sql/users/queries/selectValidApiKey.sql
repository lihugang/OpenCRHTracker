SELECT key, user_id, issuer, active_from, revoked_at, expires_at, daily_token_limit
FROM api_keys
WHERE key = ? AND revoked_at IS NULL AND active_from <= ? AND expires_at > ?;

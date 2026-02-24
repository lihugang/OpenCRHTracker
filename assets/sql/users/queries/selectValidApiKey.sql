SELECT key, user_id, created_at, revoked_at, expires_at, daily_token_limit
FROM api_keys
WHERE key = ? AND revoked_at IS NULL AND expires_at > ?;


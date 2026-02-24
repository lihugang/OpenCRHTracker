SELECT key, user_id, created_at, revoked_at, expires_at, daily_token_limit
FROM api_keys
WHERE user_id = ?
ORDER BY created_at DESC;


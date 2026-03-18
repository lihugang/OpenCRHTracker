SELECT key, revoke_id, user_id, issuer, active_from, revoked_at, expires_at, daily_token_limit
FROM api_keys
WHERE user_id = ?
ORDER BY active_from DESC;

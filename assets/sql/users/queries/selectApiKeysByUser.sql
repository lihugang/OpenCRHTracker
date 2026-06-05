SELECT key, revoke_id, user_id, issuer, name, active_from, revoked_at, expires_at
FROM api_keys
WHERE user_id = ?
ORDER BY active_from DESC;

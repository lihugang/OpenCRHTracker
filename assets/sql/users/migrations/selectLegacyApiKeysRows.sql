SELECT key, revoke_id, user_id, issuer, name, active_from, revoked_at, expires_at
FROM api_keys_legacy_pre_remove_daily_token_limit
ORDER BY active_from ASC, key ASC;

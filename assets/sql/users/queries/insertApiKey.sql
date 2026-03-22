INSERT INTO api_keys (
    key,
    revoke_id,
    user_id,
    issuer,
    name,
    active_from,
    revoked_at,
    expires_at,
    daily_token_limit
)
VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?);

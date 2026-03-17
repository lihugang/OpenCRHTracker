INSERT INTO api_keys (
    key,
    user_id,
    issuer,
    active_from,
    revoked_at,
    expires_at,
    daily_token_limit
)
VALUES (?, ?, ?, ?, NULL, ?, ?);

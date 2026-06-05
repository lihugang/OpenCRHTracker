INSERT INTO api_keys (
    key,
    revoke_id,
    user_id,
    issuer,
    oauth_client_id,
    name,
    active_from,
    revoked_at,
    expires_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?);

INSERT INTO oauth_login_continuations (
    continuation_id,
    request_json,
    created_at,
    expires_at,
    consumed_at
)
VALUES (?, ?, ?, ?, NULL);

SELECT continuation_id, request_json, created_at, expires_at, consumed_at
FROM oauth_login_continuations
WHERE continuation_id = ?;

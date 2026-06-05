UPDATE oauth_login_continuations
SET consumed_at = ?
WHERE continuation_id = ? AND consumed_at IS NULL;

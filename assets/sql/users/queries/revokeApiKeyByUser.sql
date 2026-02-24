UPDATE api_keys
SET revoked_at = ?
WHERE key = ? AND user_id = ? AND revoked_at IS NULL;


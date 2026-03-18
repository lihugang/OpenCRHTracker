UPDATE api_keys
SET revoked_at = ?
WHERE revoke_id = ? AND user_id = ? AND revoked_at IS NULL;

UPDATE api_keys
SET revoked_at = ?
WHERE user_id = ? AND issuer = ? AND revoked_at IS NULL;

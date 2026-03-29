UPDATE api_keys
SET revoked_at = ?
WHERE issuer = ? AND revoked_at IS NULL;

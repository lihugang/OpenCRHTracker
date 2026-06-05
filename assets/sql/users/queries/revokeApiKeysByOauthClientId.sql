UPDATE api_keys
SET revoked_at = ?
WHERE issuer = 'oauth' AND oauth_client_id = ? AND revoked_at IS NULL;

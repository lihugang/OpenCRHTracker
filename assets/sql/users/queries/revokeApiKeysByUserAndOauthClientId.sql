UPDATE api_keys
SET revoked_at = ?
WHERE user_id = ? AND issuer = 'oauth' AND oauth_client_id = ? AND revoked_at IS NULL;

UPDATE oauth_authorization_codes
SET consumed_at = ?
WHERE code_hash = ? AND consumed_at IS NULL;

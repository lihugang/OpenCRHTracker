SELECT code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, approved_scopes_json, auth_time, expires_at, consumed_at
FROM oauth_authorization_codes
WHERE code_hash = ?;

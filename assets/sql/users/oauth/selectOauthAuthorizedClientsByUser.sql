SELECT user_id, client_id, scope, granted_at, updated_at
FROM oauth_consents
WHERE user_id = ?
ORDER BY updated_at DESC, client_id ASC, scope ASC;

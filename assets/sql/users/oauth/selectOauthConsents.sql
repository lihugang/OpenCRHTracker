SELECT user_id, client_id, scope, granted_at, updated_at
FROM oauth_consents
WHERE user_id = ? AND client_id = ?
ORDER BY scope ASC;

INSERT INTO oauth_consents (user_id, client_id, scope, granted_at, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, client_id, scope)
DO UPDATE SET updated_at = excluded.updated_at, granted_at = excluded.granted_at;

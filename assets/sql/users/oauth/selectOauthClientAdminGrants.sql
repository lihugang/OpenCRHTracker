SELECT client_id, grant_key, enabled, updated_by, updated_at
FROM oauth_client_admin_grants
WHERE client_id = ?
ORDER BY grant_key ASC;

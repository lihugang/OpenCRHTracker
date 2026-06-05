SELECT client_id, owner_user_id, name, description, homepage_url, status, is_trusted, created_at, updated_at
FROM oauth_clients
ORDER BY updated_at DESC, client_id ASC;

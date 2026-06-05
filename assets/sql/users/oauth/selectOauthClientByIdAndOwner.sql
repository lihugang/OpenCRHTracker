SELECT client_id, owner_user_id, name, description, homepage_url, status, is_trusted, created_at, updated_at
FROM oauth_clients
WHERE client_id = ? AND owner_user_id = ?;

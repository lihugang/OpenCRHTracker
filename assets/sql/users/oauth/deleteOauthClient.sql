DELETE FROM oauth_clients
WHERE client_id = ? AND owner_user_id = ?;

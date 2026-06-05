UPDATE oauth_clients
SET
    name = ?,
    description = ?,
    homepage_url = ?,
    status = ?,
    is_trusted = ?,
    updated_at = ?
WHERE client_id = ?;

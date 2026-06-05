INSERT INTO oauth_clients (
    client_id,
    owner_user_id,
    name,
    description,
    homepage_url,
    status,
    is_trusted,
    created_at,
    updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);

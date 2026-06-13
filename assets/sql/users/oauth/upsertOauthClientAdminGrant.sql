INSERT INTO oauth_client_admin_grants (
    client_id,
    grant_key,
    enabled,
    updated_by,
    updated_at
)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(client_id, grant_key)
DO UPDATE SET
    enabled = excluded.enabled,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

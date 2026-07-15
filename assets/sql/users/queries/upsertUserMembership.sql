INSERT INTO user_memberships (
    user_id,
    group_id,
    starts_at,
    expires_at,
    source,
    granted_by,
    revoked_at,
    revoked_by,
    created_at,
    updated_at
)
VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
ON CONFLICT(user_id, group_id) DO UPDATE SET
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    source = excluded.source,
    granted_by = excluded.granted_by,
    revoked_at = NULL,
    revoked_by = NULL,
    updated_at = excluded.updated_at;

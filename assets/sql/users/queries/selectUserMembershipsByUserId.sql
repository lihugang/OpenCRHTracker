SELECT
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
FROM user_memberships
WHERE user_id = ?
ORDER BY starts_at DESC, group_id ASC;

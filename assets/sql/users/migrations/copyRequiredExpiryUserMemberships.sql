INSERT INTO user_memberships_required_expiry (
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
FROM user_memberships;

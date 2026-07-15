UPDATE user_memberships
SET
    revoked_at = ?,
    revoked_by = ?,
    updated_at = ?
WHERE user_id = ?
  AND group_id = ?
  AND revoked_at IS NULL;

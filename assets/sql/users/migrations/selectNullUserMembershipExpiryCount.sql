SELECT COUNT(*) AS count
FROM user_memberships
WHERE expires_at IS NULL;

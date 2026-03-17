DELETE FROM api_keys
WHERE revoked_at IS NOT NULL AND revoked_at <= ?;

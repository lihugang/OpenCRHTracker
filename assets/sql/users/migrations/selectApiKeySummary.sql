SELECT
    COUNT(*) AS total_count,
    SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active_count
FROM api_keys;

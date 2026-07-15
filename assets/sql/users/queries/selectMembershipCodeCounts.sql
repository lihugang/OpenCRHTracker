SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN c.used_at IS NOT NULL THEN 1 ELSE 0 END) AS used_count,
    SUM(CASE WHEN c.used_at IS NULL THEN 1 ELSE 0 END) AS unused_count
FROM membership_codes c
JOIN membership_code_batches b ON b.id = c.batch_id
WHERE (? = '' OR b.group_id = ?)
  AND (? = '' OR b.id = ?);

SELECT
    c.code,
    c.batch_id,
    c.used_at,
    c.used_by,
    b.group_id,
    b.duration_days,
    b.quantity,
    b.created_by,
    b.created_at
FROM membership_codes c
JOIN membership_code_batches b ON b.id = c.batch_id
WHERE c.code = ?
LIMIT 1;

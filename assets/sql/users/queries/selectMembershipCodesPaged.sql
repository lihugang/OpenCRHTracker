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
WHERE (? = '' OR b.group_id = ?)
  AND (? = '' OR b.id = ?)
  AND (
      ? = ''
      OR (? = 'used' AND c.used_at IS NOT NULL)
      OR (? = 'unused' AND c.used_at IS NULL)
  )
  AND (
      ? <= 0
      OR b.created_at < ?
      OR (b.created_at = ? AND c.code < ?)
  )
ORDER BY b.created_at DESC, c.code DESC
LIMIT ?;

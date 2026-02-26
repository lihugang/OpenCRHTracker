SELECT
    id,
    train_code,
    emu_code,
    start_at,
    end_at
FROM daily_emu_routes
WHERE train_code = ?
  AND start_at >= ?
  AND start_at <= ?
  AND (start_at < ? OR (start_at = ? AND id < ?))
ORDER BY start_at DESC, id DESC
LIMIT ?;

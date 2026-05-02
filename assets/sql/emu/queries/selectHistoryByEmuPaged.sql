SELECT
    id,
    train_code,
    emu_code,
    service_date,
    timetable_id
FROM daily_emu_routes
WHERE emu_code = ?
  AND service_date >= ?
  AND service_date <= ?
  AND (service_date < ? OR (service_date = ? AND id < ?))
ORDER BY service_date DESC, id DESC
LIMIT ?;

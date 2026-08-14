SELECT id, train_prefix, train_number, emu_id, service_date, timetable_id
FROM daily_emu_routes
WHERE train_prefix = ? AND train_number = ?
ORDER BY service_date DESC, id DESC
LIMIT ?;

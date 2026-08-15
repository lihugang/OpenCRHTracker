SELECT id, train_prefix, train_number, emu_id, service_date, timetable_id, status
FROM daily_emu_routes
WHERE train_prefix = ?
  AND train_number = ?
  AND emu_id = ?
  AND service_date = ?
  AND (timetable_id = ? OR timetable_id IS NULL);

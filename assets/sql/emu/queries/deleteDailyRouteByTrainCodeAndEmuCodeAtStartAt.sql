DELETE FROM daily_emu_routes
WHERE train_code = ?
  AND emu_code = ?
  AND service_date = ?
  AND (
    (timetable_id IS NULL AND ? IS NULL)
    OR timetable_id = ?
  );

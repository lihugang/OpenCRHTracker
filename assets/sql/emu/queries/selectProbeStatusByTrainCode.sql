SELECT id, train_code, emu_code, service_date, timetable_id, status
FROM probe_status
WHERE train_code = ? AND service_date = ?
ORDER BY id ASC;

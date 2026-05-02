SELECT id, train_code, emu_code, service_date, timetable_id, status
FROM probe_status
WHERE emu_code = ? AND service_date >= ? AND service_date <= ?
ORDER BY service_date ASC, id ASC;

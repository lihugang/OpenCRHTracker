SELECT id, train_prefix, train_number, emu_id, service_date, timetable_id, status
FROM probe_status
WHERE emu_id = ? AND service_date <= ? AND status IN (2, 3)
ORDER BY service_date DESC, id DESC;

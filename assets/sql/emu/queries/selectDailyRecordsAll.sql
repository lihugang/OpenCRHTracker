SELECT id, train_prefix, train_number, emu_id, service_date, timetable_id
FROM daily_emu_routes
WHERE service_date >= ? AND service_date <= ?
ORDER BY service_date DESC, id DESC;

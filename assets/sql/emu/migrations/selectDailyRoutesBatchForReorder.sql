SELECT
    id,
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status
FROM daily_emu_routes
WHERE id > ?
ORDER BY id ASC
LIMIT ?;

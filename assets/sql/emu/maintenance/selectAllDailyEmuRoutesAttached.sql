SELECT
    id,
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status
FROM emu.daily_emu_routes
ORDER BY id ASC;

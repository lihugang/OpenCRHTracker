SELECT
    id,
    train_code,
    emu_code,
    service_date,
    timetable_id
FROM daily_emu_routes
ORDER BY id ASC;

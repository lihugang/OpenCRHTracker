INSERT INTO daily_emu_routes_migrated_status (
    id,
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status
) VALUES (?, ?, ?, ?, ?, ?, ?);

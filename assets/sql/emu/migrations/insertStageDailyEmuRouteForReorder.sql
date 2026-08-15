INSERT INTO daily_emu_routes_sorted_stage (
    original_id,
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status,
    start_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?);

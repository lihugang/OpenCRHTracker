INSERT INTO daily_emu_routes (
    train_code,
    emu_code,
    service_date,
    timetable_id
) VALUES (?, ?, ?, ?)
ON CONFLICT DO NOTHING;

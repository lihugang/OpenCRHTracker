SELECT
    id,
    batch_id,
    daily_route_id,
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    start_at,
    action,
    previous_status,
    next_status,
    detail_json,
    created_at
FROM tracking_mutations
WHERE batch_id = ?
ORDER BY id ASC;

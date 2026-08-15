INSERT INTO daily_emu_routes (
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status
)
SELECT
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    status
FROM daily_emu_routes_sorted_stage
ORDER BY start_at ASC, original_id ASC;

SELECT
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id,
    COUNT(*) AS duplicate_count
FROM daily_emu_routes
GROUP BY
    train_prefix,
    train_number,
    emu_id,
    service_date,
    timetable_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

SELECT
    id,
    hash,
    timetable_json,
    stop_count,
    created_at
FROM timetable_history_contents
WHERE hash = ?;

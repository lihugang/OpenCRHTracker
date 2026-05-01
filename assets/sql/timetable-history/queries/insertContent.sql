INSERT INTO timetable_history_contents (
    hash,
    timetable_json,
    stop_count,
    created_at
) VALUES (?, ?, ?, ?)
ON CONFLICT(hash)
DO NOTHING;

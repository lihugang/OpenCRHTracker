UPDATE timetable_history_contents
SET hash = ?,
    timetable_json = ?,
    stop_count = ?
WHERE id = ?;

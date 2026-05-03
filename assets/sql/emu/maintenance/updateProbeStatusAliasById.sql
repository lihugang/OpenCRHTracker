UPDATE probe_status
SET emu_code = ?,
    timetable_id = ?,
    status = ?
WHERE id = ?;

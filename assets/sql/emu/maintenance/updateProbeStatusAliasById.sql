UPDATE probe_status
SET emu_id = ?,
    timetable_id = ?,
    status = ?
WHERE id = ?;

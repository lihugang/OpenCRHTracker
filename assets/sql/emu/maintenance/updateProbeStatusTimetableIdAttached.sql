UPDATE emu.probe_status
SET timetable_id = ?,
    status = ?
WHERE id = ?;

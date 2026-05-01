UPDATE timetable_history_coverages
SET service_date_end_exclusive = ?,
    updated_at = ?
WHERE id = ?;

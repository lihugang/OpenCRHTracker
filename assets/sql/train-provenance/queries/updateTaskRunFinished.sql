UPDATE provenance_task_runs
SET finished_at = ?,
    status = ?,
    error_message = ?
WHERE id = ?;

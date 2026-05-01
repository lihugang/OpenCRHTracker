DELETE FROM provenance_task_runs
WHERE COALESCE(finished_at, started_at) < ?;

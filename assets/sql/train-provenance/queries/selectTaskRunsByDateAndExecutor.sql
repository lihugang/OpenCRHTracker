SELECT
    id,
    scheduler_task_id,
    executor,
    execution_time,
    started_at,
    finished_at,
    status,
    error_message,
    task_args_json,
    service_date,
    primary_train_prefix,
    primary_train_number,
    primary_start_at,
    primary_emu_id
FROM provenance_task_runs
WHERE service_date = ?
  AND executor = ?
ORDER BY started_at ASC, id ASC;

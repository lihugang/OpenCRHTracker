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
    primary_train_code,
    primary_start_at,
    primary_emu_code
FROM provenance_task_runs
WHERE scheduler_task_id = ?;

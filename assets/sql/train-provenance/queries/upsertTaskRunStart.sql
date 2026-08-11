INSERT INTO provenance_task_runs (
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
) VALUES (?, ?, ?, ?, NULL, 'running', '', ?, ?, ?, ?, ?, ?)
ON CONFLICT(scheduler_task_id) DO UPDATE SET
    executor = excluded.executor,
    execution_time = excluded.execution_time,
    started_at = excluded.started_at,
    finished_at = NULL,
    status = 'running',
    error_message = '',
    task_args_json = excluded.task_args_json,
    service_date = excluded.service_date,
    primary_train_prefix = excluded.primary_train_prefix,
    primary_train_number = excluded.primary_train_number,
    primary_start_at = excluded.primary_start_at,
    primary_emu_id = excluded.primary_emu_id;

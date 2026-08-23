INSERT INTO tracking_mutation_batches (
    task_run_id, scheduler_task_id, source, operation, event_type,
    service_date, start_at, detail_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);

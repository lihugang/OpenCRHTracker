INSERT INTO provenance_events (
    task_run_id,
    sequence_no,
    created_at,
    service_date,
    train_code,
    start_at,
    emu_code,
    related_train_code,
    related_emu_code,
    event_type,
    result,
    linked_scheduler_task_id,
    payload_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

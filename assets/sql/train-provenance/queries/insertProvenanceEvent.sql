INSERT INTO provenance_events (
    task_run_id,
    sequence_no,
    created_at,
    service_date,
    train_prefix,
    train_number,
    start_at,
    emu_id,
    related_train_prefix,
    related_train_number,
    related_emu_id,
    event_type,
    result,
    linked_scheduler_task_id,
    payload_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

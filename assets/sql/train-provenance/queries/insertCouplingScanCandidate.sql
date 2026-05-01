INSERT INTO coupling_scan_candidates (
    task_run_id,
    candidate_order,
    service_date,
    bureau,
    model,
    candidate_emu_code,
    status,
    reason,
    scanned_train_code,
    scanned_internal_code,
    scanned_start_at,
    matched_train_code,
    matched_start_at,
    train_repeat,
    detail_json,
    created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

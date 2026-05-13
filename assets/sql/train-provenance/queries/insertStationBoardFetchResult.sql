INSERT INTO station_board_fetch_results (
    task_run_id,
    service_date,
    parent_scheduler_task_id,
    station_name,
    station_telecode,
    result_status,
    row_count,
    parsed_entry_count,
    saved_entry_count,
    consumed_queue_entry_count,
    rows_json,
    created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(task_run_id) DO UPDATE SET
    service_date = excluded.service_date,
    parent_scheduler_task_id = excluded.parent_scheduler_task_id,
    station_name = excluded.station_name,
    station_telecode = excluded.station_telecode,
    result_status = excluded.result_status,
    row_count = excluded.row_count,
    parsed_entry_count = excluded.parsed_entry_count,
    saved_entry_count = excluded.saved_entry_count,
    consumed_queue_entry_count = excluded.consumed_queue_entry_count,
    rows_json = excluded.rows_json,
    created_at = excluded.created_at;

SELECT
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
FROM station_board_fetch_results
WHERE service_date = ?
  AND parent_scheduler_task_id = ?
ORDER BY created_at ASC, task_run_id ASC;

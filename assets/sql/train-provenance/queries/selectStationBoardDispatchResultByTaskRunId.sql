SELECT
    task_run_id,
    service_date,
    candidate_group_count,
    selected_station_count,
    selected_stations_json,
    created_task_count,
    reused_task_count,
    skipped_not_found_count,
    skipped_ambiguous_count,
    detail_json,
    created_at
FROM station_board_dispatch_results
WHERE task_run_id = ?;

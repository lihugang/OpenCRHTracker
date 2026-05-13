INSERT INTO station_board_dispatch_results (
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
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(task_run_id) DO UPDATE SET
    service_date = excluded.service_date,
    candidate_group_count = excluded.candidate_group_count,
    selected_station_count = excluded.selected_station_count,
    selected_stations_json = excluded.selected_stations_json,
    created_task_count = excluded.created_task_count,
    reused_task_count = excluded.reused_task_count,
    skipped_not_found_count = excluded.skipped_not_found_count,
    skipped_ambiguous_count = excluded.skipped_ambiguous_count,
    detail_json = excluded.detail_json,
    created_at = excluded.created_at;

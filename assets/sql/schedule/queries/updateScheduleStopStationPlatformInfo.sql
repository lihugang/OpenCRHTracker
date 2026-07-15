UPDATE schedule_stops
SET
    platform_no = ?,
    wicket = ?,
    station_platform_info_fetched_at = ?
WHERE state_kind = ?
AND item_code = ?
AND stop_index = ?;

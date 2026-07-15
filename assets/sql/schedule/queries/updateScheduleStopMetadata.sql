UPDATE schedule_stops
SET
    distance = COALESCE(?, distance),
    platform_no = COALESCE(?, platform_no),
    station_platform_info_fetched_at = CASE
        WHEN ? IS NOT NULL THEN NULL
        ELSE station_platform_info_fetched_at
    END
WHERE state_kind = ?
AND item_code = ?
AND stop_index = ?;

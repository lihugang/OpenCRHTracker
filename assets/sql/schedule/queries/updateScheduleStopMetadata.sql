UPDATE schedule_stops
SET
    distance = COALESCE(?, distance),
    platform_no = COALESCE(?, platform_no)
WHERE state_kind = ?
AND item_code = ?
AND stop_index = ?;

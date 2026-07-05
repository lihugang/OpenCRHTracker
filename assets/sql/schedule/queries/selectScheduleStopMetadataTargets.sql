SELECT
    stop_index AS stopIndex,
    distance,
    platform_no AS platformNo
FROM schedule_stops
WHERE state_kind = ?
AND item_code = ?
AND station_telecode = ?
ORDER BY stop_index ASC;

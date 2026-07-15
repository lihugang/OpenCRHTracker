SELECT
    stop_index AS stopIndex,
    station_no AS stationNo,
    arrive_at AS arriveAt,
    wicket,
    distance,
    platform_no AS platformNo,
    station_platform_info_fetched_at AS stationPlatformInfoFetchedAt
FROM schedule_stops
WHERE state_kind = ?
AND item_code = ?
AND station_telecode = ?
ORDER BY stop_index ASC;

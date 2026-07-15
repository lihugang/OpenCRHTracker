SELECT
    station_no AS stationNo,
    station_name AS stationName,
    station_telecode AS stationTelecode,
    arrive_at AS arriveAt,
    depart_at AS departAt,
    station_train_code AS stationTrainCode,
    wicket,
    distance,
    platform_no AS platformNo,
    station_platform_info_fetched_at AS stationPlatformInfoFetchedAt,
    is_start AS isStart,
    is_end AS isEnd
FROM schedule_stops
WHERE state_kind = ?
  AND item_code = ?
ORDER BY stop_index ASC;

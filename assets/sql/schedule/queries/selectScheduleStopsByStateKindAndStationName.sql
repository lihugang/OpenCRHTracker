SELECT
    i.item_code AS itemCode,
    i.item_index AS itemIndex,
    i.internal_code AS internalCode,
    i.bureau_code AS bureauCode,
    i.train_style AS trainStyle,
    i.train_department AS trainDepartment,
    i.passenger_department AS passengerDepartment,
    i.start_station AS startStation,
    i.end_station AS endStation,
    i.start_at AS startAt,
    i.end_at AS endAt,
    i.last_route_refresh_at AS lastRouteRefreshAt,
    s.station_no AS stationNo,
    s.station_name AS stationName,
    s.station_telecode AS stationTelecode,
    s.arrive_at AS arriveAt,
    s.depart_at AS departAt,
    s.station_train_code AS stationTrainCode,
    s.wicket,
    s.distance,
    s.platform_no AS platformNo,
    s.station_platform_info_fetched_at AS stationPlatformInfoFetchedAt,
    s.is_start AS isStart,
    s.is_end AS isEnd
FROM schedule_stops s
JOIN schedule_items i
  ON i.state_kind = s.state_kind
 AND i.item_code = s.item_code
WHERE s.state_kind = ?
  AND s.station_name = ?
ORDER BY s.arrive_at ASC, s.depart_at ASC, i.item_code ASC, s.station_no ASC;

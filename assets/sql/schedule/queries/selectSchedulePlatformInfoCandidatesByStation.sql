SELECT
    current_stop.item_code AS itemCode,
    item.internal_code AS internalCode,
    current_stop.stop_index AS stopIndex,
    current_stop.station_no AS stationNo,
    current_stop.station_telecode AS stationTelecode,
    current_stop.arrive_at AS arriveAt,
    current_stop.depart_at AS departAt,
    current_stop.station_train_code AS currentStationTrainCode,
    previous_stop.station_train_code AS arrivalStationTrainCode,
    current_stop.is_start AS isStart
FROM schedule_stops current_stop
JOIN schedule_items item
  ON item.state_kind = current_stop.state_kind
 AND item.item_code = current_stop.item_code
LEFT JOIN schedule_stops previous_stop
  ON previous_stop.state_kind = current_stop.state_kind
 AND previous_stop.item_code = current_stop.item_code
 AND previous_stop.stop_index = current_stop.stop_index - 1
WHERE current_stop.state_kind = ?
  AND current_stop.station_name = ?
  AND (
      (
          current_stop.station_platform_info_fetched_at IS NULL
          AND current_stop.platform_no IS NULL
      )
      OR current_stop.station_platform_info_fetched_at <= ?
  )
ORDER BY
    current_stop.arrive_at ASC,
    current_stop.depart_at ASC,
    current_stop.item_code ASC,
    current_stop.stop_index ASC;

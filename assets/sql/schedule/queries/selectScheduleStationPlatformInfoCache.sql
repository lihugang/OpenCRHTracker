SELECT
    lookup_type AS lookupType,
    internal_code AS internalCode,
    station_telecode AS stationTelecode,
    station_train_code AS stationTrainCode,
    platform_no AS platformNo,
    wicket,
    train_date AS trainDate,
    fetched_at AS fetchedAt
FROM schedule_station_platform_info_cache
WHERE lookup_type = ?
AND internal_code = ?
AND station_telecode = ?
AND station_train_code = ?;

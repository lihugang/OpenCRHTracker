SELECT
    id,
    train_code,
    emu_code,
    start_station_name,
    end_station_name,
    start_at,
    end_at
FROM daily_emu_routes
WHERE train_code = ?
  AND start_at >= ?
  AND start_at < ?
ORDER BY start_at ASC, id ASC;

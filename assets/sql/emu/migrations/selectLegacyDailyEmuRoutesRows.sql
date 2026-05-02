SELECT
    id,
    train_code,
    emu_code,
    start_station_name,
    end_station_name,
    start_at,
    end_at
FROM daily_emu_routes
ORDER BY id ASC;

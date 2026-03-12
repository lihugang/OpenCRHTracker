INSERT INTO daily_emu_routes (
    train_code,
    emu_code,
    start_station_name,
    end_station_name,
    start_at,
    end_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(train_code, emu_code, start_at)
DO UPDATE SET
    start_station_name = CASE
        WHEN excluded.start_station_name <> '' THEN excluded.start_station_name
        ELSE daily_emu_routes.start_station_name
    END,
    end_station_name = CASE
        WHEN excluded.end_station_name <> '' THEN excluded.end_station_name
        ELSE daily_emu_routes.end_station_name
    END,
    end_at = excluded.end_at;

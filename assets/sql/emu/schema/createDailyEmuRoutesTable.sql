CREATE TABLE IF NOT EXISTS daily_emu_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    train_code TEXT NOT NULL,
    emu_code TEXT NOT NULL,
    start_station_name TEXT NOT NULL,
    end_station_name TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    UNIQUE(train_code, emu_code, start_at)
);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_train_start
ON daily_emu_routes(train_code, start_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_emu_start
ON daily_emu_routes(emu_code, start_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_daily_emu_routes_start_id
ON daily_emu_routes(start_at DESC, id DESC);

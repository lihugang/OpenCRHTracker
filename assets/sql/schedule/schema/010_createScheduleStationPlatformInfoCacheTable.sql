CREATE TABLE IF NOT EXISTS schedule_station_platform_info_cache (
    lookup_type TEXT NOT NULL CHECK(lookup_type IN ('origin_transport', 'arrival_exit')),
    internal_code TEXT NOT NULL,
    station_telecode TEXT NOT NULL,
    station_train_code TEXT NOT NULL,
    platform_no INTEGER,
    wicket TEXT,
    train_date TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (
        lookup_type,
        internal_code,
        station_telecode,
        station_train_code
    ),
    CHECK (platform_no IS NOT NULL OR wicket IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_schedule_station_platform_info_cache_fetched_at
ON schedule_station_platform_info_cache(fetched_at);

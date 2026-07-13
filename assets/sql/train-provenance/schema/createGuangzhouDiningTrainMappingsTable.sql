CREATE TABLE IF NOT EXISTS guangzhou_dining_train_mappings (
    service_date TEXT NOT NULL,
    train_code TEXT NOT NULL,
    train_uuid TEXT NOT NULL,
    returned_train_code TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (service_date, train_code, train_uuid)
);

CREATE INDEX IF NOT EXISTS idx_guangzhou_dining_train_mappings_date_created
ON guangzhou_dining_train_mappings(service_date, created_at, train_code);

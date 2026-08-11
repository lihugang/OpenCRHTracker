CREATE TABLE IF NOT EXISTS guangzhou_dining_train_mappings (
    service_date INTEGER NOT NULL CHECK(service_date >= 0),
    train_prefix TEXT NOT NULL DEFAULT '',
    train_number INTEGER NOT NULL CHECK(train_number >= 0 AND train_number <= 9999),
    train_uuid TEXT NOT NULL,
    returned_train_prefix TEXT NOT NULL DEFAULT '',
    returned_train_number INTEGER NOT NULL CHECK(returned_train_number >= 0 AND returned_train_number <= 9999),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (service_date, train_prefix, train_number, train_uuid)
);

CREATE INDEX IF NOT EXISTS idx_guangzhou_dining_train_mappings_uuid
ON guangzhou_dining_train_mappings(train_uuid, service_date, train_prefix, train_number);

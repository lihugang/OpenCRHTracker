INSERT INTO guangzhou_dining_train_mappings (
    service_date,
    train_code,
    train_uuid,
    returned_train_code,
    created_at,
    updated_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(service_date, train_code, train_uuid) DO UPDATE SET
    returned_train_code = excluded.returned_train_code,
    updated_at = excluded.updated_at;

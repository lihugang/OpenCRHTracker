SELECT
    service_date,
    train_code,
    train_uuid,
    returned_train_code,
    created_at,
    updated_at
FROM guangzhou_dining_train_mappings
WHERE service_date = ?
ORDER BY created_at ASC, train_code ASC, train_uuid ASC;

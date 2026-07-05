INSERT INTO schedule_meta (
    key,
    value
) VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET
    value = excluded.value;

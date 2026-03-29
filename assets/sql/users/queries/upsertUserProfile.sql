INSERT INTO user_profiles (user_id, data_json, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
    data_json = excluded.data_json,
    updated_at = excluded.updated_at;

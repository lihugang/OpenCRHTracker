INSERT INTO user_event_subscriptions (
    user_id,
    target_type,
    target_id,
    created_at,
    updated_at
)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET
    updated_at = excluded.updated_at;

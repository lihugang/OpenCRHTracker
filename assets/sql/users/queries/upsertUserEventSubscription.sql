INSERT INTO user_event_subscriptions_v2 (
    user_id,
    kind,
    emu_id,
    topic_id,
    train_prefix,
    train_number,
    target_key,
    created_at,
    updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id, kind, target_key) DO UPDATE SET
    updated_at = excluded.updated_at;

SELECT
    user_id,
    kind,
    emu_id,
    topic_id,
    train_prefix,
    train_number,
    target_key,
    created_at,
    updated_at
FROM user_event_subscriptions_v2
WHERE kind = ?
    AND target_key = ?
ORDER BY updated_at DESC, user_id ASC;

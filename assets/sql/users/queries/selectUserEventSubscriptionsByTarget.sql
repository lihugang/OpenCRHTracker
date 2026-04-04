SELECT user_id, target_type, target_id, created_at, updated_at
FROM user_event_subscriptions
WHERE target_type = ?
    AND target_id = ?
ORDER BY updated_at DESC, user_id ASC;

SELECT user_id, target_type, target_id, created_at, updated_at
FROM user_event_subscriptions
WHERE user_id = ?
ORDER BY updated_at DESC, target_type ASC, target_id ASC;

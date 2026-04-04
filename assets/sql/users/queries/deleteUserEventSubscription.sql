DELETE FROM user_event_subscriptions
WHERE user_id = ?
    AND target_type = ?
    AND target_id = ?;

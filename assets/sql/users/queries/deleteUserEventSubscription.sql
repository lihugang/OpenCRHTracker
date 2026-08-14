DELETE FROM user_event_subscriptions_v2
WHERE user_id = ?
    AND kind = ?
    AND target_key = ?;

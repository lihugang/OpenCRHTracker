SELECT
    id,
    user_id,
    action,
    status,
    source,
    reason,
    actor_user_id,
    qq_number,
    ip_address,
    user_agent,
    matched_action_id,
    changed,
    requested_at,
    completed_at,
    error_message
FROM user_ban_actions
WHERE id = ?

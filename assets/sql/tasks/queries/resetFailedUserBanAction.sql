UPDATE user_ban_actions
SET status = 'pending',
    changed = NULL,
    completed_at = NULL,
    error_message = NULL
WHERE id = ?
  AND action = 'ban'
  AND status = 'failed'

UPDATE user_ban_actions
SET status = 'succeeded',
    changed = ?,
    completed_at = ?,
    error_message = NULL
WHERE id = ?
  AND status = 'pending'

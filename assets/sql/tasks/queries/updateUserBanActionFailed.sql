UPDATE user_ban_actions
SET status = 'failed',
    completed_at = ?,
    error_message = ?
WHERE id = ?
  AND status = 'pending'

UPDATE user_risk_cases
SET ban_action_id = ?,
    updated_at = ?
WHERE id = ?
  AND ban_action_id IS NULL
  AND status = 'escalating'

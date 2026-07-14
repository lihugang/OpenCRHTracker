UPDATE user_risk_cases
SET status = 'active',
    updated_at = ?,
    error_message = NULL
WHERE id = ?
  AND status = 'pending'

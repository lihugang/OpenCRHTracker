UPDATE user_risk_cases
SET status = 'escalating',
    qq_number = ?,
    updated_at = ?,
    error_message = NULL
WHERE id = ?
  AND qq_number IS NULL
  AND status IN ('pending', 'active', 'failed')

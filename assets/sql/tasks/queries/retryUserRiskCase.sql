UPDATE user_risk_cases
SET status = CASE WHEN qq_number IS NULL THEN 'pending' ELSE 'escalating' END,
    updated_at = ?,
    error_message = NULL
WHERE id = ?
  AND status = 'failed'

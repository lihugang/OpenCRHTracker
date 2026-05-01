SELECT DISTINCT start_at
FROM provenance_events
WHERE service_date = ?
  AND train_code = ?
  AND start_at IS NOT NULL
ORDER BY start_at ASC;

SELECT DISTINCT start_at
FROM provenance_events
WHERE service_date = ?
  AND train_prefix = ?
  AND train_number = ?
  AND start_at IS NOT NULL
ORDER BY start_at ASC;

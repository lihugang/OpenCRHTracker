SELECT DISTINCT
    b.id,
    b.task_run_id,
    b.scheduler_task_id,
    b.source,
    b.operation,
    b.event_type,
    b.service_date,
    b.start_at,
    b.detail_json,
    b.created_at
FROM tracking_mutation_batches AS b
INNER JOIN tracking_mutations AS m ON m.batch_id = b.id
WHERE m.service_date = ?
  AND m.train_prefix = ?
  AND m.train_number = ?
  AND (? IS NULL OR m.start_at = ?)
ORDER BY b.created_at ASC, b.id ASC;

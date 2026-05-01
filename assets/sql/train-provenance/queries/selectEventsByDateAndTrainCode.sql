SELECT
    e.id,
    e.task_run_id,
    tr.scheduler_task_id,
    tr.executor,
    tr.status AS task_status,
    e.created_at,
    e.service_date,
    e.train_code,
    e.start_at,
    e.emu_code,
    e.related_train_code,
    e.related_emu_code,
    e.event_type,
    e.result,
    e.linked_scheduler_task_id,
    linked.id AS linked_task_run_id,
    e.payload_json
FROM provenance_events AS e
INNER JOIN provenance_task_runs AS tr
    ON tr.id = e.task_run_id
LEFT JOIN provenance_task_runs AS linked
    ON linked.scheduler_task_id = e.linked_scheduler_task_id
WHERE e.service_date = ?
  AND e.train_code = ?
  AND (? IS NULL OR e.start_at = ?)
ORDER BY e.created_at ASC, tr.started_at ASC, e.sequence_no ASC, e.id ASC;
